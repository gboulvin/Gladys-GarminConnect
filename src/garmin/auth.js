// -----------------------------------------------------------------------------
// Garmin Connect sign-in.
//
// Garmin offers no public API to individuals: like every community client
// (python-garminconnect, Home Assistant...), the integration signs in the way
// the Garmin Connect mobile app does:
//
//   1. POST the credentials to the SSO login API (iOS app flow, then the web
//      portal flow as a fallback) -> a CAS service ticket, or MFA_REQUIRED;
//   2. with MFA, POST the code Garmin sent (email/SMS/app) on the SAME SSO
//      session (cookies) -> the service ticket;
//   3. exchange the ticket for a native "DI" OAuth2 token pair
//      (diauth.garmin.com): a short-lived Bearer access token + a refresh
//      token, refreshed without the password from then on.
//
// The password is only used for step 1; the tokens are stored under /data
// (see tokenStore.js) and never logged.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { CookieJar, buildUrl, httpRequest, readJson } from './http.js';
import { GarminAuthError, GarminBlockedError, GarminMfaRequiredError } from './errors.js';

const logger = createLogger({ name: 'garmin-auth' });

export const ALLOWED_DOMAINS = ['garmin.com', 'garmin.cn'];

const IOS_SSO_CLIENT_ID = 'GCM_IOS_DARK';
const PORTAL_SSO_CLIENT_ID = 'GarminConnect';
const IOS_LOGIN_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Headers of the Garmin Connect Android app, expected by the DI token host
// and the API tier.
export const NATIVE_HEADERS = {
  'User-Agent': 'GCM-Android-5.23',
  'X-Garmin-User-Agent':
    'com.garmin.android.apps.connectmobile/5.23; ; Google/sdk_gphone64_arm64/google; Android/33; Dalvik/2.1.0',
  'X-Garmin-Paired-App-Version': '10861',
  'X-Garmin-Client-Platform': 'Android',
  'X-App-Ver': '10861',
  'X-Lang': 'en',
  'X-GCExperience': 'GC5',
  'Accept-Language': 'en-US,en;q=0.9',
};

const DI_GRANT_TYPE = 'https://connectapi.garmin.com/di-oauth2-service/oauth/grant/service_ticket';
const DI_CLIENT_IDS = [
  'GARMIN_CONNECT_MOBILE_ANDROID_DI_2025Q2',
  'GARMIN_CONNECT_MOBILE_ANDROID_DI_2024Q4',
  'GARMIN_CONNECT_MOBILE_ANDROID_DI',
  'GARMIN_CONNECT_MOBILE_IOS_DI',
];

// Refresh the access token this long before it expires.
export const REFRESH_MARGIN_MS = 15 * 60 * 1000;

/** Payload of a JWT, without verifying it (Garmin holds the key), or null. */
export function decodeJwtPayload(token) {
  try {
    const [header, payload] = String(token).split('.');
    if (!payload) {
      return null;
    }
    const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    if (decode(header).alg === 'none') {
      return null;
    }
    return decode(payload);
  } catch {
    return null;
  }
}

/** Token set stored by the integration, from a DI token endpoint answer. */
export function toTokens(body, fallbackClientId) {
  if (!body?.access_token) {
    throw new GarminAuthError('Garmin returned no access token');
  }
  const payload = decodeJwtPayload(body.access_token);
  const expiresAt = Number.isFinite(payload?.exp)
    ? payload.exp * 1000
    : Date.now() + Number(body.expires_in ?? 3600) * 1000;
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? null,
    client_id: payload?.client_id ? String(payload.client_id) : fallbackClientId,
    expires_at: expiresAt,
  };
}

export class GarminAuth {
  /**
   * @param {{ domain?: string, portalDelayMs?: number }} [options]
   *   `portalDelayMs`: pause between the GET and the POST of the portal
   *   fallback, which Cloudflare flags when they follow too closely.
   */
  constructor({ domain = 'garmin.com', portalDelayMs = 5000 } = {}) {
    if (!ALLOWED_DOMAINS.includes(domain)) {
      throw new Error(`Invalid Garmin domain: ${domain}`);
    }
    this.domain = domain;
    this.portalDelayMs = portalDelayMs;
    this.sso = `https://sso.${domain}`;
    this.iosServiceUrl = `https://mobile.integration.${domain}/gcm/ios`;
    this.portalServiceUrl = `https://connect.${domain}/app`;
    this.diTokenUrl = `https://diauth.${domain}/di-oauth2-service/oauth/token`;
    // The SSO conversation waiting for an MFA code, if any.
    this.pendingMfa = null;
  }

  get mfaPending() {
    return this.pendingMfa !== null;
  }

  /**
   * Sign in with the credentials. Resolves the tokens, or throws
   * GarminMfaRequiredError (then call `submitMfaCode`), GarminAuthError on
   * refused credentials, GarminBlockedError when every flow was blocked.
   */
  async login(email, password) {
    this.pendingMfa = null;
    const strategies = [
      ['mobile', () => this.mobileLogin(email, password)],
      ['portal', () => this.portalLogin(email, password)],
    ];
    let lastError;
    for (const [name, run] of strategies) {
      try {
        logger.debug(`Trying the ${name} sign-in flow`);
        return await run();
      } catch (err) {
        if (err instanceof GarminAuthError || err instanceof GarminMfaRequiredError) {
          throw err;
        }
        logger.warn(`The ${name} sign-in flow failed: ${err.message}`);
        lastError = err;
      }
    }
    if (lastError instanceof GarminBlockedError) {
      throw lastError;
    }
    throw new GarminBlockedError(`Every Garmin sign-in flow failed: ${lastError?.message}`);
  }

  async mobileLogin(email, password) {
    const params = { clientId: IOS_SSO_CLIENT_ID, locale: 'en-US', service: this.iosServiceUrl };
    const headers = {
      'User-Agent': IOS_LOGIN_UA,
      Accept: 'application/json, text/plain, */*',
      Origin: this.sso,
    };
    return this.ssoApiLogin({
      flow: 'mobile',
      jar: new CookieJar(),
      params,
      headers,
      serviceUrl: this.iosServiceUrl,
      email,
      password,
    });
  }

  async portalLogin(email, password) {
    const jar = new CookieJar();
    const signinUrl = `${this.sso}/portal/sso/en-US/sign-in`;
    const page = await httpRequest(
      buildUrl(signinUrl, '', { clientId: PORTAL_SSO_CLIENT_ID, service: this.portalServiceUrl }),
      {
        headers: {
          'User-Agent': DESKTOP_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        jar,
      },
    );
    if (page.status === 429) {
      throw new GarminBlockedError('Portal sign-in page: HTTP 429');
    }
    if (this.portalDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.portalDelayMs));
    }
    const params = {
      clientId: PORTAL_SSO_CLIENT_ID,
      locale: 'en-US',
      service: this.portalServiceUrl,
    };
    const headers = {
      'User-Agent': DESKTOP_UA,
      Accept: 'application/json, text/plain, */*',
      Origin: this.sso,
      Referer: `${signinUrl}?clientId=${PORTAL_SSO_CLIENT_ID}&service=${this.portalServiceUrl}`,
    };
    return this.ssoApiLogin({
      flow: 'portal',
      jar,
      params,
      headers,
      serviceUrl: this.portalServiceUrl,
      email,
      password,
    });
  }

  async ssoApiLogin({ flow, jar, params, headers, serviceUrl, email, password }) {
    const response = await httpRequest(buildUrl(this.sso, `/${flow}/api/login`, params), {
      method: 'POST',
      headers,
      json: { username: email, password, rememberMe: true, captchaToken: '' },
      jar,
    });
    if (response.status === 429 || response.status === 403) {
      throw new GarminBlockedError(`${flow} sign-in: HTTP ${response.status}`);
    }
    const body = await readJson(response);
    if (!body) {
      throw new GarminBlockedError(`${flow} sign-in: unexpected answer (HTTP ${response.status})`);
    }
    const type = body.responseStatus?.type;
    if (type === 'SUCCESSFUL' && body.serviceTicketId) {
      return this.exchangeServiceTicket(body.serviceTicketId, serviceUrl);
    }
    if (type === 'MFA_REQUIRED') {
      const method = body.customerMfaInfo?.mfaLastMethodUsed ?? 'email';
      this.pendingMfa = { flow, jar, params, headers, serviceUrl, method };
      throw new GarminMfaRequiredError(method);
    }
    if (type === 'INVALID_USERNAME_PASSWORD') {
      throw new GarminAuthError('Invalid Garmin email or password');
    }
    if (body.error?.['status-code'] === '429') {
      throw new GarminBlockedError(`${flow} sign-in: rate limited`);
    }
    if (type === 'CAPTCHA_REQUIRED') {
      throw new GarminBlockedError(`${flow} sign-in: captcha required`);
    }
    if (type === 'ACCOUNT_LOCKED' || type === 'ACCOUNT_DISABLED') {
      throw new GarminAuthError(`Garmin account refused: ${type}`);
    }
    throw new GarminBlockedError(`${flow} sign-in failed: ${type ?? `HTTP ${response.status}`}`);
  }

  /**
   * Finish a sign-in waiting for its verification code. A wrong code keeps
   * the conversation open, so the user can retry.
   */
  async submitMfaCode(code) {
    const pending = this.pendingMfa;
    if (!pending) {
      throw new GarminAuthError('No Garmin sign-in is waiting for a verification code');
    }
    const response = await httpRequest(
      buildUrl(this.sso, `/${pending.flow}/api/mfa/verifyCode`, pending.params),
      {
        method: 'POST',
        headers: pending.headers,
        json: {
          mfaMethod: pending.method,
          mfaVerificationCode: String(code).trim(),
          rememberMyBrowser: true,
          reconsentList: [],
          mfaSetup: false,
        },
        jar: pending.jar,
      },
    );
    if (response.status === 429) {
      throw new GarminBlockedError('MFA verification: HTTP 429');
    }
    const body = await readJson(response);
    if (body?.responseStatus?.type === 'SUCCESSFUL' && body.serviceTicketId) {
      this.pendingMfa = null;
      return this.exchangeServiceTicket(body.serviceTicketId, pending.serviceUrl);
    }
    throw new GarminAuthError(
      `Verification code refused (${body?.responseStatus?.type ?? `HTTP ${response.status}`})`,
    );
  }

  /** CAS service ticket -> DI OAuth2 tokens, trying each known app client id. */
  async exchangeServiceTicket(ticket, serviceUrl) {
    for (const clientId of DI_CLIENT_IDS) {
      const response = await httpRequest(this.diTokenUrl, {
        method: 'POST',
        headers: {
          ...NATIVE_HEADERS,
          Authorization: basicAuth(clientId),
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
        },
        form: {
          client_id: clientId,
          service_ticket: ticket,
          grant_type: DI_GRANT_TYPE,
          service_url: serviceUrl,
        },
      });
      if (response.status === 429) {
        throw new GarminBlockedError('Token exchange: HTTP 429');
      }
      if (!response.ok) {
        logger.debug(`Token exchange refused for ${clientId}: HTTP ${response.status}`);
        continue;
      }
      const body = await readJson(response);
      if (body?.access_token) {
        return toTokens(body, clientId);
      }
    }
    throw new GarminAuthError('Garmin refused to issue a session token');
  }

  /** New access token from the refresh token, without the password. */
  async refresh(tokens) {
    if (!tokens?.refresh_token || !tokens.client_id) {
      throw new GarminAuthError('No refresh token: sign in again');
    }
    const response = await httpRequest(this.diTokenUrl, {
      method: 'POST',
      headers: {
        ...NATIVE_HEADERS,
        Authorization: basicAuth(tokens.client_id),
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
      form: {
        grant_type: 'refresh_token',
        client_id: tokens.client_id,
        refresh_token: tokens.refresh_token,
      },
    });
    if (response.status === 429) {
      throw new GarminBlockedError('Token refresh: HTTP 429');
    }
    if (!response.ok) {
      throw new GarminAuthError(`Token refresh refused: HTTP ${response.status}`);
    }
    const refreshed = toTokens(await readJson(response), tokens.client_id);
    return { ...refreshed, refresh_token: refreshed.refresh_token ?? tokens.refresh_token };
  }
}

function basicAuth(clientId) {
  return `Basic ${Buffer.from(`${clientId}:`).toString('base64')}`;
}

/** True when the access token is expired or about to be. */
export function tokensExpireSoon(tokens, now = Date.now()) {
  return !tokens?.expires_at || now > tokens.expires_at - REFRESH_MARGIN_MS;
}

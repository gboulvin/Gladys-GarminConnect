// -----------------------------------------------------------------------------
// The Garmin Connect account, seen from the integration: session lifecycle
// (sign-in, MFA, stored tokens, sign-out) and synchronization (one coherent
// snapshot of the account per sync, plus the events since the previous one).
//
// It knows nothing about Gladys: index.js publishes what it returns. That keeps
// it testable with a mocked `fetch` and nothing else.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { GarminAuth } from './auth.js';
import { GarminApi } from './api.js';
import { TokenStore } from './tokenStore.js';
import { GarminAuthError, GarminBlockedError, GarminMfaRequiredError } from './errors.js';
import { hasCredentials } from '../config.js';
import { detectEvents } from '../events.js';
import {
  addDays,
  localDate,
  parseActivities,
  parseBodyComposition,
  parseDailySummary,
  parseDevices,
  parseHrv,
  parseLastUsed,
  parseSleep,
  parseTrainingReadiness,
} from '../metrics.js';

const logger = createLogger({ name: 'garmin' });

// After Garmin blocked a sign-in, wait this long before an automatic retry
// (a manual "Sign in" action still retries at once).
export const AUTO_LOGIN_BACKOFF_MS = 60 * 60 * 1000;

export const STATUS = {
  NOT_CONFIGURED: 'not_configured',
  MFA_REQUIRED: 'mfa_required',
  AUTH_FAILED: 'auth_failed',
  SESSION_EXPIRED: 'session_expired',
  BLOCKED: 'blocked',
  UNREACHABLE: 'unreachable',
  CONNECTED: 'connected',
};

/** The user must act: a sign-in cannot happen without them. */
export class GarminSignInNeededError extends GarminAuthError {
  constructor(status) {
    super(`Garmin sign-in needed (${status})`);
    this.reason = status;
  }
}

export class GarminService {
  constructor({
    tokenStore = new TokenStore(),
    createAuth = (domain) => new GarminAuth({ domain }),
  } = {}) {
    this.tokenStore = tokenStore;
    this.createAuth = createAuth;
    this.config = null;
    this.auth = null;
    this.api = null;
    this.profile = null;
    this.snapshot = null;
    this.status = STATUS.NOT_CONFIGURED;
    this.lastError = null;
    this.autoLoginBlockedUntil = 0;
    this.autoLoginRefused = false;
    this.syncing = null;
  }

  get account() {
    return this.config ? { email: this.config.email, domain: this.config.domain } : null;
  }

  /**
   * Apply a (new) configuration. Another account or domain starts a new
   * session; the same one keeps the session and a pending MFA conversation.
   */
  configure(config) {
    const sameAccount =
      this.config &&
      this.config.email.toLowerCase() === config.email.toLowerCase() &&
      this.config.domain === config.domain;
    const passwordChanged = this.config && this.config.password !== config.password;
    this.config = config;
    if (!sameAccount) {
      this.auth = this.createAuth(config.domain);
      this.api = null;
      this.profile = null;
      this.snapshot = null;
    }
    if (!sameAccount || passwordChanged) {
      // New credentials deserve a new automatic attempt.
      this.autoLoginRefused = false;
      this.autoLoginBlockedUntil = 0;
    }
    if (!hasCredentials(config)) {
      this.status = STATUS.NOT_CONFIGURED;
    }
  }

  async startApi(tokens) {
    const account = this.account;
    this.api = new GarminApi({
      auth: this.auth,
      tokens,
      onTokens: (fresh) => this.tokenStore.save(account, fresh),
    });
    await this.tokenStore.save(account, tokens);
  }

  /** A usable API session: stored tokens, else an automatic sign-in. */
  async ensureSession() {
    if (this.api?.authenticated) {
      return;
    }
    if (!this.config || !hasCredentials(this.config)) {
      this.status = STATUS.NOT_CONFIGURED;
      throw new GarminSignInNeededError(STATUS.NOT_CONFIGURED);
    }
    const stored = await this.tokenStore.load(this.account);
    if (stored) {
      this.api = new GarminApi({
        auth: this.auth,
        tokens: stored,
        onTokens: (fresh) => this.tokenStore.save(this.account, fresh),
      });
      return;
    }
    // Never re-send the password automatically after a refusal or while a code
    // is awaited: each attempt may e-mail the user a new MFA code.
    if (this.auth.mfaPending) {
      this.status = STATUS.MFA_REQUIRED;
      throw new GarminSignInNeededError(STATUS.MFA_REQUIRED);
    }
    if (this.autoLoginRefused) {
      throw new GarminSignInNeededError(this.status);
    }
    if (Date.now() < this.autoLoginBlockedUntil) {
      this.status = STATUS.BLOCKED;
      throw new GarminSignInNeededError(STATUS.BLOCKED);
    }
    await this.login();
  }

  async login() {
    try {
      await this.startApi(await this.auth.login(this.config.email, this.config.password));
      this.autoLoginRefused = false;
    } catch (err) {
      this.handleSignInError(err);
      throw err;
    }
  }

  handleSignInError(err) {
    if (err instanceof GarminMfaRequiredError) {
      this.status = STATUS.MFA_REQUIRED;
    } else if (err instanceof GarminAuthError) {
      this.status = STATUS.AUTH_FAILED;
      this.autoLoginRefused = true;
    } else if (err instanceof GarminBlockedError) {
      this.status = STATUS.BLOCKED;
      this.autoLoginBlockedUntil = Date.now() + AUTO_LOGIN_BACKOFF_MS;
    } else {
      this.status = STATUS.UNREACHABLE;
    }
    this.lastError = err;
  }

  /**
   * Explicit sign-in from the Configuration screen: with a code, finishes the
   * pending MFA conversation; without, starts a new sign-in (which may end in
   * GarminMfaRequiredError: Garmin then sends the code).
   */
  async signIn(mfaCode) {
    if (!this.config || !hasCredentials(this.config)) {
      throw new GarminSignInNeededError(STATUS.NOT_CONFIGURED);
    }
    this.api = null;
    this.profile = null;
    const code = String(mfaCode ?? '').trim();
    try {
      if (code) {
        await this.startApi(await this.auth.submitMfaCode(code));
      } else {
        await this.startApi(await this.auth.login(this.config.email, this.config.password));
      }
      this.autoLoginRefused = false;
      this.autoLoginBlockedUntil = 0;
    } catch (err) {
      // A wrong code keeps the MFA conversation open: still waiting for one.
      this.handleSignInError(code && this.auth.mfaPending ? new GarminMfaRequiredError() : err);
      throw err;
    }
  }

  async signOut() {
    await this.tokenStore.clear();
    if (this.config) {
      this.auth = this.createAuth(this.config.domain);
    }
    this.api = null;
    this.profile = null;
    this.snapshot = null;
    this.autoLoginRefused = true;
    this.status =
      this.config && hasCredentials(this.config) ? STATUS.SESSION_EXPIRED : STATUS.NOT_CONFIGURED;
  }

  /**
   * Synchronize the account: resolves `{ snapshot, events }`. Concurrent
   * calls share the running synchronization.
   * @param {{ deviceExternalId: (garminDeviceId: string) => string }} options
   */
  sync(options) {
    this.syncing ??= this.runSync(options).finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  async runSync({ deviceExternalId }) {
    try {
      await this.ensureSession();
      const snapshot = await this.fetchSnapshot();
      const events = detectEvents(this.snapshot, snapshot, {
        bodyBatteryLowThreshold: this.config.body_battery_low_threshold,
        deviceExternalId,
      });
      this.snapshot = snapshot;
      this.status = STATUS.CONNECTED;
      this.lastError = null;
      return { snapshot, events };
    } catch (err) {
      if (err instanceof GarminSignInNeededError) {
        throw err;
      }
      if (err instanceof GarminAuthError && !(err instanceof GarminMfaRequiredError)) {
        // Tokens Garmin no longer accepts: forget them, the next sync signs in
        // again with the stored password.
        if (this.api) {
          await this.tokenStore.clear();
          this.api = null;
          this.profile = null;
          this.status = STATUS.SESSION_EXPIRED;
          this.lastError = err;
          throw err;
        }
      }
      if (!(err instanceof GarminAuthError) && this.status === STATUS.CONNECTED) {
        this.status = err instanceof GarminBlockedError ? STATUS.BLOCKED : STATUS.UNREACHABLE;
      }
      this.lastError = err;
      throw err;
    }
  }

  async fetchSnapshot() {
    const api = this.api;
    if (!this.profile) {
      const profile = await api.getSocialProfile();
      if (!profile?.displayName && !profile?.profileId) {
        throw new GarminAuthError('Garmin returned no user profile');
      }
      this.profile = {
        id: String(profile.profileId ?? profile.displayName),
        display_name: String(profile.displayName ?? profile.userName ?? ''),
        full_name: String(profile.fullName || profile.displayName || this.config.email),
      };
    }
    const { display_name: displayName } = this.profile;
    const date = localDate(this.config.timezone);

    const requests = {
      devices: api.getDevices(),
      lastUsed: api.getDeviceLastUsed(),
      summary: api.getDailySummary(displayName, date),
      sleep: api.getSleep(displayName, date),
      hrv: api.getHrv(date),
      readiness: api.getTrainingReadiness(date),
      composition: api.getBodyComposition(addDays(date, -30), date),
      activities: api.getActivities(10),
    };
    const names = Object.keys(requests);
    const settled = await Promise.allSettled(Object.values(requests));
    const raw = {};
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        raw[names[index]] = result.value;
        return;
      }
      if (result.reason instanceof GarminAuthError) {
        throw result.reason;
      }
      // One missing endpoint (no scale, no HRV sensor, a Garmin hiccup) must
      // not hide all the other values.
      logger.warn(`Garmin ${names[index]} unavailable: ${result.reason?.message}`);
    });
    if (settled.every((result) => result.status === 'rejected')) {
      throw settled[0].reason;
    }

    return {
      synced_at: Date.now(),
      date,
      profile: this.profile,
      devices: parseDevices(raw.devices),
      last_used: parseLastUsed(raw.lastUsed),
      metrics: {
        ...parseDailySummary(raw.summary),
        ...parseSleep(raw.sleep),
        ...parseHrv(raw.hrv),
        ...parseTrainingReadiness(raw.readiness),
        ...parseBodyComposition(raw.composition),
      },
      activities: parseActivities(raw.activities),
    };
  }
}

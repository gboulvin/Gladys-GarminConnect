// -----------------------------------------------------------------------------
// Garmin Connect API client (connectapi.garmin.com), read-only.
//
// Holds the session tokens, refreshes them before they expire (and once more
// on a 401), and persists every new token set through `onTokens`. Endpoints
// are the ones the Garmin Connect app itself calls; their answers are parsed
// defensively in src/metrics.js, since Garmin documents none of them.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { NATIVE_HEADERS, tokensExpireSoon } from './auth.js';
import { buildUrl, httpRequest, readJson } from './http.js';
import { GarminApiError, GarminAuthError, GarminBlockedError } from './errors.js';

const logger = createLogger({ name: 'garmin-api' });

export class GarminApi {
  /**
   * @param {{ auth: import('./auth.js').GarminAuth, tokens?: object,
   *           onTokens?: (tokens: object) => Promise<void> }} options
   */
  constructor({ auth, tokens = null, onTokens = async () => {} }) {
    this.auth = auth;
    this.tokens = tokens;
    this.onTokens = onTokens;
    this.baseUrl = `https://connectapi.${auth.domain}`;
    this.refreshing = null;
  }

  get authenticated() {
    return Boolean(this.tokens?.access_token);
  }

  async setTokens(tokens) {
    this.tokens = tokens;
    await this.onTokens(tokens);
  }

  async refreshTokens() {
    // One refresh at a time: concurrent requests share it, and a refresh
    // token is never spent twice.
    this.refreshing ??= (async () => {
      try {
        logger.debug('Refreshing the Garmin access token');
        await this.setTokens(await this.auth.refresh(this.tokens));
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  /** GET a JSON resource; resolves null on 204/404 (no data for that day...). */
  async get(path, query) {
    if (!this.authenticated) {
      throw new GarminAuthError('Not signed in to Garmin Connect');
    }
    if (tokensExpireSoon(this.tokens)) {
      await this.refreshTokens();
    }
    let response = await this.send(path, query);
    if (response.status === 401) {
      await this.refreshTokens();
      response = await this.send(path, query);
    }
    if (response.status === 204 || response.status === 404) {
      return null;
    }
    if (response.status === 401) {
      throw new GarminAuthError('Garmin refused the session token');
    }
    if (response.status === 429) {
      throw new GarminBlockedError(`Garmin API rate limit on ${path}`, { status: 429 });
    }
    if (!response.ok) {
      throw new GarminApiError(`Garmin API error ${response.status} on ${path}`, {
        status: response.status,
      });
    }
    return readJson(response);
  }

  send(path, query) {
    return httpRequest(buildUrl(this.baseUrl, path, query), {
      headers: {
        ...NATIVE_HEADERS,
        Authorization: `Bearer ${this.tokens.access_token}`,
        Accept: 'application/json',
      },
      timeoutMs: 20_000,
    });
  }

  // --- Endpoints --------------------------------------------------------------

  getSocialProfile() {
    return this.get('/userprofile-service/socialProfile');
  }

  getDevices() {
    return this.get('/device-service/deviceregistration/devices');
  }

  getDeviceLastUsed() {
    return this.get('/device-service/deviceservice/mylastused');
  }

  getDailySummary(displayName, date) {
    return this.get(`/usersummary-service/usersummary/daily/${encodeURIComponent(displayName)}`, {
      calendarDate: date,
    });
  }

  getSleep(displayName, date) {
    return this.get(
      `/wellness-service/wellness/dailySleepData/${encodeURIComponent(displayName)}`,
      {
        date,
        nonSleepBufferMinutes: 60,
      },
    );
  }

  getHrv(date) {
    return this.get(`/hrv-service/hrv/${date}`);
  }

  getTrainingReadiness(date) {
    return this.get(`/metrics-service/metrics/trainingreadiness/${date}`);
  }

  getBodyComposition(startDate, endDate) {
    return this.get('/weight-service/weight/dateRange', { startDate, endDate });
  }

  getActivities(limit = 10) {
    return this.get('/activitylist-service/activities/search/activities', { start: 0, limit });
  }
}

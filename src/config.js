// -----------------------------------------------------------------------------
// Integration configuration, filled in by the user from the `config_schema` of
// gladys-assistant-integration.json. This module provides the defaults and
// normalizes the received object, so the rest of the code never deals with
// `undefined` or numbers typed as strings.
// -----------------------------------------------------------------------------

import { ALLOWED_DOMAINS } from './garmin/auth.js';
import { DEFAULT_LANGUAGE, LANGUAGES } from './i18n.js';
import { isValidTimeZone } from './metrics.js';

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  email: '',
  password: '',
  domain: 'garmin.com',
  // Seconds between two synchronizations with Garmin Connect. Garmin
  // rate-limits its API: five minutes minimum.
  poll_frequency: 900,
  // Body Battery level under which the `body_battery_low` scene trigger fires.
  body_battery_low_threshold: 20,
  // Time zone of the Garmin account, to ask for "today" the way Garmin dates it.
  timezone: 'Europe/Paris',
  // Language of the device and feature names created in Gladys.
  device_language: DEFAULT_LANGUAGE,
};

export const POLL_FREQUENCY_BOUNDS = { min: 300, max: 86400 };

function clamp(value, { min, max }, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const config = { ...DEFAULT_CONFIG, ...raw };
  return {
    ...config,
    email: String(config.email ?? '').trim(),
    password: String(config.password ?? ''),
    domain: ALLOWED_DOMAINS.includes(config.domain) ? config.domain : DEFAULT_CONFIG.domain,
    poll_frequency: clamp(
      config.poll_frequency,
      POLL_FREQUENCY_BOUNDS,
      DEFAULT_CONFIG.poll_frequency,
    ),
    body_battery_low_threshold: clamp(
      config.body_battery_low_threshold,
      { min: 1, max: 100 },
      DEFAULT_CONFIG.body_battery_low_threshold,
    ),
    timezone: isValidTimeZone(config.timezone) ? config.timezone : DEFAULT_CONFIG.timezone,
    device_language: LANGUAGES.includes(config.device_language)
      ? config.device_language
      : DEFAULT_CONFIG.device_language,
  };
}

/** True when the user saved credentials. */
export function hasCredentials(config) {
  return Boolean(config.email && config.password);
}

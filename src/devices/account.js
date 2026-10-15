// -----------------------------------------------------------------------------
// Device type: GARMIN CONNECT ACCOUNT
//
// Garmin merges the data of every wearable of an account into one daily
// picture (steps, heart rate, sleep, Body Battery, weigh-ins...): those values
// belong to the account, not to one watch, and survive a watch replacement.
// They are published on one Gladys device per account, keyed by the Garmin
// profile id — never by a device id, so the history follows the user.
//
// Gladys has no health category: a value without a dedicated category uses
// the generic `unknown` one, its unit in the feature name when Gladys has none
// (bpm, kg). Feature keys are forever: published once, never renamed.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { text } from '../i18n.js';

export const DEVICE_TYPE = 'account';

const integer = { type: TYPES.SENSOR.INTEGER };
const decimal = { type: TYPES.SENSOR.DECIMAL };

// key: feature key AND metric name (src/metrics.js).
export const ACCOUNT_FEATURES = [
  { key: 'steps', category: CATEGORIES.COUNTER_SENSOR, ...integer, min: 0, max: 200000 },
  { key: 'step_goal', category: CATEGORIES.COUNTER_SENSOR, ...integer, min: 0, max: 200000 },
  {
    key: 'distance_km',
    name: 'distance',
    category: CATEGORIES.DISTANCE_SENSOR,
    ...decimal,
    unit: UNITS.KM,
    min: 0,
    max: 1000,
  },
  { key: 'active_calories', category: CATEGORIES.COUNTER_SENSOR, ...integer, min: 0, max: 20000 },
  { key: 'floors', category: CATEGORIES.COUNTER_SENSOR, ...integer, min: 0, max: 1000 },
  {
    key: 'intensity_minutes',
    category: CATEGORIES.DURATION,
    type: TYPES.DURATION.INTEGER,
    unit: UNITS.MINUTES,
    min: 0,
    max: 2880,
  },
  { key: 'resting_heart_rate', category: CATEGORIES.UNKNOWN, ...integer, min: 0, max: 250 },
  { key: 'stress_average', category: CATEGORIES.UNKNOWN, ...integer, min: 0, max: 100 },
  { key: 'body_battery', category: CATEGORIES.UNKNOWN, ...integer, min: 0, max: 100 },
  {
    key: 'spo2',
    category: CATEGORIES.UNKNOWN,
    ...integer,
    unit: UNITS.PERCENT,
    min: 0,
    max: 100,
  },
  { key: 'respiration', category: CATEGORIES.UNKNOWN, ...decimal, min: 0, max: 100 },
  {
    key: 'sleep_hours',
    name: 'sleep_duration',
    category: CATEGORIES.DURATION,
    type: TYPES.DURATION.DECIMAL,
    unit: UNITS.HOURS,
    min: 0,
    max: 24,
  },
  { key: 'sleep_score', category: CATEGORIES.UNKNOWN, ...integer, min: 0, max: 100 },
  {
    key: 'hrv',
    category: CATEGORIES.UNKNOWN,
    ...integer,
    unit: UNITS.MILLISECONDS,
    min: 0,
    max: 300,
  },
  { key: 'training_readiness', category: CATEGORIES.UNKNOWN, ...integer, min: 0, max: 100 },
  { key: 'weight_kg', name: 'weight', category: CATEGORIES.UNKNOWN, ...decimal, min: 0, max: 500 },
  {
    key: 'body_fat',
    category: CATEGORIES.UNKNOWN,
    ...decimal,
    unit: UNITS.PERCENT,
    min: 0,
    max: 100,
  },
  { key: 'bmi', category: CATEGORIES.UNKNOWN, ...decimal, min: 0, max: 100 },
];

export function accountIds(gladys, profile) {
  return gladys.externalIds(DEVICE_TYPE, profile.id);
}

/** Discovery payload of the account device. */
export function buildAccountDevice(gladys, profile, language) {
  const ids = accountIds(gladys, profile);
  return {
    name: text('account_device', language, { name: profile.full_name }),
    external_id: ids.device,
    params: [{ name: 'GARMIN_DISPLAY_NAME', value: profile.display_name }],
    features: ACCOUNT_FEATURES.map((feature) => ({
      name: text(`feature_${feature.name ?? feature.key}`, language),
      external_id: ids.feature(feature.key),
      category: feature.category,
      type: feature.type,
      ...(feature.unit ? { unit: feature.unit } : {}),
      min: feature.min,
      max: feature.max,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    })),
  };
}

/** States of the account device; a value Garmin did not give is skipped. */
export function accountStates(gladys, profile, metrics) {
  const ids = accountIds(gladys, profile);
  return ACCOUNT_FEATURES.filter(
    (feature) => metrics[feature.key] !== null && metrics[feature.key] !== undefined,
  ).map((feature) => ({
    device_feature_external_id: ids.feature(feature.key),
    state: metrics[feature.key],
  }));
}

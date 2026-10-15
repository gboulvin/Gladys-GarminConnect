// -----------------------------------------------------------------------------
// Device type: GARMIN DEVICE (watch, bike computer, Index scale, BPM...)
//
// One Gladys device per device registered on the Garmin Connect account,
// keyed by its Garmin device id. Its features tell when it last synced with
// Garmin Connect — the health values themselves live on the account device
// (see ./account.js) — so a scene can, for example, warn about a watch that
// has not synced for a day. The `device_synced` scene trigger targets these
// devices too.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { text } from '../i18n.js';

export const DEVICE_TYPE = 'device';

export const DEVICE_FEATURES = {
  SINCE_LAST_SYNC: 'since_last_sync',
  LAST_USED: 'last_used',
};

export function garminDeviceIds(gladys, garminDeviceId) {
  return gladys.externalIds(DEVICE_TYPE, garminDeviceId);
}

/** Discovery payload of one registered Garmin device. */
export function buildGarminDevice(gladys, device, language) {
  const ids = garminDeviceIds(gladys, device.id);
  const params = [
    { name: 'GARMIN_DEVICE_ID', value: device.id },
    ...(device.model ? [{ name: 'MODEL', value: device.model }] : []),
    ...(device.firmware ? [{ name: 'FIRMWARE', value: device.firmware }] : []),
  ];
  return {
    name:
      device.model && device.model !== device.name
        ? `${device.name} (${device.model})`
        : device.name,
    external_id: ids.device,
    params,
    features: [
      {
        name: text('feature_since_last_sync', language),
        external_id: ids.feature(DEVICE_FEATURES.SINCE_LAST_SYNC),
        category: CATEGORIES.DURATION,
        type: TYPES.DURATION.INTEGER,
        unit: UNITS.MINUTES,
        min: 0,
        max: 525600,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
      {
        name: text('feature_last_used', language),
        external_id: ids.feature(DEVICE_FEATURES.LAST_USED),
        category: CATEGORIES.UNKNOWN,
        type: TYPES.SENSOR.BINARY,
        min: 0,
        max: 1,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
    ],
  };
}

/**
 * States of one registered device. Garmin only tells which device uploaded
 * last, and when: the others only get their "last synced device" flag.
 */
export function garminDeviceStates(gladys, device, lastUsed, now = Date.now()) {
  const ids = garminDeviceIds(gladys, device.id);
  const isLastUsed = lastUsed?.device_id === device.id;
  const states = [
    {
      device_feature_external_id: ids.feature(DEVICE_FEATURES.LAST_USED),
      state: isLastUsed ? 1 : 0,
    },
  ];
  if (isLastUsed) {
    states.push({
      device_feature_external_id: ids.feature(DEVICE_FEATURES.SINCE_LAST_SYNC),
      state: Math.max(0, Math.round((now - lastUsed.upload_time) / 60000)),
    });
  }
  return states;
}

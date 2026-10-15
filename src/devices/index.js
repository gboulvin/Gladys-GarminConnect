// -----------------------------------------------------------------------------
// Device registry: what the integration publishes to Gladys from a Garmin
// Connect snapshot (see GarminService.sync for its shape).
//
//   - one ACCOUNT device (health values of the account, ./account.js);
//   - one device per Garmin device registered on the account (./garminDevice.js).
//
// No device is controllable: Garmin Connect only exposes data. Nothing is
// polled by Gladys either: index.js runs its own synchronization timer at the
// configured interval (Gladys polls a minute at most, Garmin wants fewer calls).
// -----------------------------------------------------------------------------

import { accountIds, accountStates, buildAccountDevice } from './account.js';
import { buildGarminDevice, garminDeviceIds, garminDeviceStates } from './garminDevice.js';

/** Discovery payload: the account device first, then the Garmin devices. */
export function buildDiscoveredDevices(gladys, snapshot, language) {
  if (!snapshot) {
    return [];
  }
  return [
    buildAccountDevice(gladys, snapshot.profile, language),
    ...snapshot.devices.map((device) => buildGarminDevice(gladys, device, language)),
  ];
}

/** Every state of the snapshot, in the `publishStates` format. */
export function buildStates(gladys, snapshot, now = Date.now()) {
  if (!snapshot) {
    return [];
  }
  return [
    ...accountStates(gladys, snapshot.profile, snapshot.metrics),
    ...snapshot.devices.flatMap((device) =>
      garminDeviceStates(gladys, device, snapshot.last_used, now),
    ),
  ];
}

/** External id of the account device feature carrying a metric, or null. */
export function accountFeatureId(gladys, snapshot, metric) {
  return snapshot ? accountIds(gladys, snapshot.profile).feature(metric) : null;
}

/** External id of the Gladys device of a Garmin device id. */
export function deviceExternalIdOf(gladys, garminDeviceId) {
  return garminDeviceIds(gladys, garminDeviceId).device;
}

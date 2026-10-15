import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { DEVICE_FEATURE_UNITS } from '@gladysassistant/integration-sdk';
import { CONFIG, setup } from './helpers/setup.js';
import { TRIGGERS } from '../src/events.js';
import { STATUS } from '../src/garmin/service.js';

const accountFeature = (gladys, key) => gladys.externalId(`account:12345:${key}`);

test('on connection: devices, states and connection status are published', async (t) => {
  const { gladys } = await setup(t);

  const devices = gladys.fake.discoveredDevices;
  assert.equal(devices.length, 3, 'the account + the two registered Garmin devices');
  assert.equal(devices[0].name, 'Garmin Connect - Jane Doe');
  assert.equal(devices[0].features.find((f) => f.external_id.endsWith(':steps')).name, 'Pas');
  assert.equal(devices[1].name, 'Forerunner 265');
  assert.equal(devices[2].name, 'Index S2');
  assert.equal(
    devices[0].features.find((f) => f.external_id.endsWith(':distance_km')).unit,
    DEVICE_FEATURE_UNITS.KM,
  );

  assert.equal(gladys.fake.lastState(accountFeature(gladys, 'steps')), 8500);
  assert.equal(gladys.fake.lastState(accountFeature(gladys, 'distance_km')), 6.54);
  assert.equal(gladys.fake.lastState(accountFeature(gladys, 'intensity_minutes')), 40);
  assert.equal(gladys.fake.lastState(accountFeature(gladys, 'sleep_hours')), 7.5);
  assert.equal(gladys.fake.lastState(accountFeature(gladys, 'weight_kg')), 70.5);
  assert.equal(gladys.fake.lastState(gladys.externalId('device:3456:last_used')), 1);
  assert.equal(gladys.fake.lastState(gladys.externalId('device:3456:since_last_sync')), 10);
  assert.equal(gladys.fake.lastState(gladys.externalId('device:7890:last_used')), 0);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.sceneEvents.length, 0, 'the first sync only seeds the events');
});

test('the session is stored owner-only and reused after a restart', async (t) => {
  const { garmin, dataDir, gladys, app } = await setup(t);
  const file = path.join(dataDir, 'garmin-session.json');
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(saved.email, CONFIG.email);
  assert.ok(saved.tokens.refresh_token);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.ok(!JSON.stringify(saved).includes(CONFIG.password), 'never the password');

  // A new process (fresh service) reuses the session: no new sign-in.
  app.stop();
  await gladys.disconnect();
  const logins = garmin.state.loginCount;
  const second = await setup(t, { fakeGarmin: garmin, dataDir });
  assert.equal(garmin.state.loginCount, logins);
  assert.equal(second.gladys.fake.connectionStatus.connected, true);
});

test('second sync: scene events for what happened in between', async (t) => {
  const { garmin, gladys, app } = await setup(t);
  garmin.state.summary = {
    ...garmin.state.summary,
    totalSteps: 10250,
    bodyBatteryMostRecentValue: 15,
  };
  garmin.state.activities = [
    {
      activityId: 222,
      activityName: 'Evening Ride',
      activityType: { typeKey: 'road_biking' },
      startTimeGMT: '2026-10-15 17:00:00',
      distance: 30120,
      duration: 4000,
      calories: 800,
      averageHR: 130,
    },
    ...garmin.state.activities,
  ];
  garmin.state.composition = {
    dateWeightList: [{ date: 1760100000000, weight: 70100, bmi: 22.3, bodyFat: 18.0 }],
  };
  garmin.state.lastUsed = { userDeviceId: 3456, lastUsedDeviceUploadTime: Date.now() };

  await app.synchronize('test');
  const events = Object.fromEntries(gladys.fake.sceneEvents.map((e) => [e.key, e.data]));
  assert.deepEqual(events[TRIGGERS.ACTIVITY_COMPLETED], {
    activity_type: 'cycling',
    activity_name: 'Evening Ride',
    distance_km: 30.12,
    duration_minutes: 66.7,
    calories: 800,
    average_hr: 130,
  });
  assert.deepEqual(events[TRIGGERS.STEP_GOAL_REACHED], { steps: 10250, step_goal: 10000 });
  assert.deepEqual(events[TRIGGERS.BODY_BATTERY_LOW], { body_battery: 15, threshold: 20 });
  assert.deepEqual(events[TRIGGERS.WEIGH_IN_RECORDED], {
    weight_kg: 70.1,
    body_fat: 18,
    bmi: 22.3,
  });
  assert.deepEqual(events[TRIGGERS.DEVICE_SYNCED], {
    device: gladys.externalId('device:3456'),
    device_name: 'Forerunner 265',
  });
  assert.equal(events[TRIGGERS.SLEEP_RECORDED], undefined, 'same night: no new sleep event');

  // Nothing new: nothing fired again.
  const count = gladys.fake.sceneEvents.length;
  await app.synchronize('test');
  assert.equal(gladys.fake.sceneEvents.length, count);
});

test('without credentials the user is told what to do, Garmin is not called', async (t) => {
  const { gladys, garmin } = await setup(t, { config: {} });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /e-mail et le mot de passe/);
  assert.equal(garmin.state.requests.length, 0);
});

test('wrong password: reported once, never retried automatically', async (t) => {
  const { gladys, garmin, app, service } = await setup(t, {
    garmin: { password: 'something else' },
  });
  assert.equal(service.status, STATUS.AUTH_FAILED);
  assert.match(gladys.fake.connectionStatus.message.en, /check your email and password/);
  await app.synchronize('timer').catch(() => {});
  assert.equal(garmin.state.loginCount, 1, 'no new attempt with the same password');

  // A new password in the configuration is tried.
  garmin.state.password = 'new password';
  await gladys.fake.configUpdated({ ...CONFIG, password: 'new password' });
  assert.equal(service.status, STATUS.CONNECTED);
});

test('MFA: sign_in sends the code, then signs in with it', async (t) => {
  const { gladys, garmin, service } = await setup(t, { garmin: { mfa: true } });
  assert.equal(service.status, STATUS.MFA_REQUIRED);
  assert.match(gladys.fake.connectionStatus.message.en, /verification code/);
  const logins = garmin.state.loginCount;

  // The timer does not resend the password (it would e-mail a new code).
  await gladys.fake.configUpdated(CONFIG);
  assert.equal(garmin.state.loginCount, logins);

  const wrong = await gladys.fake.action('sign_in', { mfa_code: '999999' });
  assert.match(wrong.data.message.en, /verification code/);

  const ack = await gladys.fake.action('sign_in', { mfa_code: '123456' });
  assert.equal(ack.success, true);
  assert.match(ack.data.message.fr, /Connecté en tant que Jane Doe : 2 appareil/);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.discoveredDevices.length, 3);
});

test('sign_in with a code while nothing waits for one', async (t) => {
  const { gladys } = await setup(t);
  const ack = await gladys.fake.action('sign_in', { mfa_code: '123456' });
  assert.match(ack.data.message.en, /No sign-in is waiting/);
});

test('test_connection, sync_now and sign_out actions', async (t) => {
  const { gladys, dataDir } = await setup(t);
  const test1 = await gladys.fake.action('test_connection', {});
  assert.match(test1.data.message.de, /Verbindung OK: Jane Doe, heute 8500 Schritte/);

  const sync = await gladys.fake.action('sync_now', {});
  assert.match(sync.data.message.es, /Sincronizado: 2 dispositivo/);

  const out = await gladys.fake.action('sign_out', {});
  assert.match(out.data.message.en, /Signed out/);
  await assert.rejects(readFile(path.join(dataDir, 'garmin-session.json')));
  assert.equal(gladys.fake.connectionStatus.connected, false);
});

test('an expired session signs in again with the stored password', async (t) => {
  const { garmin, app, service } = await setup(t);
  garmin.state.rejectNextApiCall = true;
  garmin.state.refreshRefused = true;
  await assert.rejects(app.synchronize('timer'));
  assert.equal(service.status, STATUS.SESSION_EXPIRED);

  garmin.state.refreshRefused = false;
  await app.synchronize('timer');
  assert.equal(service.status, STATUS.CONNECTED);
  assert.equal(garmin.state.loginCount, 2);
});

test('a missing endpoint does not hide the other values', async (t) => {
  const { gladys } = await setup(t, { garmin: { hrv: null, composition: null } });
  assert.equal(gladys.fake.lastState(accountFeature(gladys, 'steps')), 8500);
  assert.equal(gladys.fake.lastState(accountFeature(gladys, 'hrv')), undefined);
});

test('changing the device language re-publishes the device names', async (t) => {
  const { gladys } = await setup(t);
  await gladys.fake.configUpdated({ ...CONFIG, device_language: 'de' });
  const [account] = gladys.fake.discoveredDevices;
  assert.equal(account.features.find((f) => f.external_id.endsWith(':steps')).name, 'Schritte');
});

test('a scan request publishes the devices', async (t) => {
  const { gladys } = await setup(t);
  const before = gladys.fake.requests.filter((r) => r.path === '/discovered_device').length;
  await gladys.fake.scanRequest();
  const after = gladys.fake.requests.filter((r) => r.path === '/discovered_device').length;
  assert.equal(after, before + 1);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setup } from './helpers/setup.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { TRIGGERS, detectEvents, MAX_ACTIVITY_EVENTS_PER_SYNC } from '../src/events.js';
import { ACTIVITY_TYPES } from '../src/metrics.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const declarationOf = (list, key) => manifest[list].find((entry) => entry.key === key);
const keysOf = (list) => (list ?? []).map((entry) => entry.key);

function assertDeclaredOutputs(key, outputs) {
  const declaration = declarationOf('scene_actions', key);
  const declared = new Map(declaration.outputs.map((output) => [output.key, output.type]));
  for (const [name, value] of Object.entries(outputs)) {
    assert.ok(declared.has(name), `${key}: output "${name}" is not declared`);
    assert.equal(typeof value, declared.get(name), `${key}: output "${name}" type`);
  }
}

test('get_daily_summary returns the declared outputs of today', async (t) => {
  const { gladys } = await setup(t);
  const ack = await gladys.fake.sceneAction('get_daily_summary', { refresh: false });
  assert.equal(ack.success, true);
  assert.equal(ack.data.outputs.steps, 8500);
  assert.equal(ack.data.outputs.sleep_score, 82);
  assertDeclaredOutputs('get_daily_summary', ack.data.outputs);
});

test('get_last_activity returns the latest activity, or found: false', async (t) => {
  const { gladys, garmin } = await setup(t);
  const ack = await gladys.fake.sceneAction('get_last_activity', {});
  assert.deepEqual(ack.data.outputs, {
    found: true,
    name: 'Morning Run',
    type: 'running',
    start_time: '2026-10-15T06:30:00Z',
    distance_km: 10.23,
    duration_minutes: 52.1,
    calories: 640,
    average_hr: 148,
  });
  assertDeclaredOutputs('get_last_activity', ack.data.outputs);

  garmin.state.activities = [];
  const none = await gladys.fake.sceneAction('get_last_activity', { refresh: true });
  assert.deepEqual(none.data.outputs, { found: false });
});

test('sync_now reports a failure as an output, never as a failed action', async (t) => {
  const { gladys, garmin } = await setup(t);
  const ok = await gladys.fake.sceneAction('sync_now', {});
  assert.deepEqual(ok.data.outputs, { synced: true, steps: 8500, body_battery: 64 });
  assertDeclaredOutputs('sync_now', ok.data.outputs);

  garmin.state.rejectNextApiCall = true;
  garmin.state.refreshRefused = true;
  const ko = await gladys.fake.sceneAction('sync_now', {});
  assert.equal(ko.success, true);
  assert.deepEqual(ko.data.outputs, { synced: false });
});

test('every scene event carries only the keys its trigger declares', async (t) => {
  const { gladys, garmin, app } = await setup(t);
  garmin.state.summary = {
    ...garmin.state.summary,
    totalSteps: 12000,
    bodyBatteryMostRecentValue: 5,
  };
  garmin.state.sleep = {
    dailySleepDTO: {
      calendarDate: '2026-10-16',
      sleepTimeSeconds: 25200,
      sleepScores: { overall: { value: 75 } },
    },
  };
  garmin.state.composition = { dateWeightList: [{ date: 1761000000000, weight: 69000 }] };
  garmin.state.lastUsed = { userDeviceId: 7890, lastUsedDeviceUploadTime: Date.now() };
  garmin.state.activities = [
    {
      activityId: 9,
      activityName: 'Swim',
      activityType: { typeKey: 'lap_swimming' },
      startTimeGMT: '2026-10-15 18:00:00',
    },
    ...garmin.state.activities,
  ];
  await app.synchronize('test');

  const fired = new Set(gladys.fake.sceneEvents.map((event) => event.key));
  assert.deepEqual([...fired].sort(), Object.values(TRIGGERS).sort(), 'every trigger can fire');
  for (const { key, data } of gladys.fake.sceneEvents) {
    const trigger = declarationOf('scene_triggers', key);
    const declared = [...keysOf(trigger.fields), ...keysOf(trigger.variables)];
    for (const [name, value] of Object.entries(data)) {
      assert.ok(declared.includes(name), `${key}: data.${name} is not declared`);
      assert.ok(value === null || typeof value !== 'object', `${key}: data.${name} is flat`);
    }
  }
  const activity = gladys.fake.sceneEvents.find((e) => e.key === TRIGGERS.ACTIVITY_COMPLETED);
  const options = declarationOf('scene_triggers', TRIGGERS.ACTIVITY_COMPLETED).fields[0].options;
  assert.ok(options.some((option) => option.value === activity.data.activity_type));
});

test('the activity filter offers exactly the activity families', () => {
  const options = declarationOf('scene_triggers', TRIGGERS.ACTIVITY_COMPLETED).fields[0].options;
  assert.deepEqual(options.map((option) => option.value).sort(), [...ACTIVITY_TYPES].sort());
});

test('a burst of uploads fires a bounded number of activity events, oldest first', () => {
  const snapshot = (activities) => ({
    date: '2026-10-15',
    metrics: {},
    devices: [],
    last_used: null,
    activities,
  });
  const activity = (id, hour) => ({
    id: String(id),
    name: `A${id}`,
    type: 'running',
    start_time: `2026-10-15T${String(hour).padStart(2, '0')}:00:00Z`,
  });
  const previous = snapshot([activity(1, 1)]);
  const next = snapshot(
    [9, 8, 7, 6, 5, 4, 3, 2].map((id) => activity(id, id + 1)).concat([activity(1, 1)]),
  );
  const events = detectEvents(previous, next, {
    bodyBatteryLowThreshold: 20,
    deviceExternalId: String,
  });
  assert.equal(events.length, MAX_ACTIVITY_EVENTS_PER_SYNC);
  assert.equal(events[0].data.activity_name, 'A5');
  assert.equal(events.at(-1).data.activity_name, 'A9');
});

test('the step goal fires once a day, again the next day', () => {
  const snapshot = (date, steps) => ({
    date,
    metrics: { steps, step_goal: 10000 },
    devices: [],
    last_used: null,
    activities: [],
  });
  const options = { bodyBatteryLowThreshold: 20, deviceExternalId: String };
  assert.equal(detectEvents(snapshot('d1', 9000), snapshot('d1', 10500), options).length, 1);
  assert.equal(detectEvents(snapshot('d1', 10500), snapshot('d1', 11000), options).length, 0);
  assert.equal(detectEvents(snapshot('d1', 11000), snapshot('d2', 10001), options).length, 1);
  assert.equal(detectEvents(null, snapshot('d2', 10001), options).length, 0);
});

test('every scene action declared has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
});

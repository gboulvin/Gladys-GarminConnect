import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/config.js';
import { LANGUAGES, MESSAGES, msg, text } from '../src/i18n.js';
import {
  activityFamily,
  localDate,
  parseActivities,
  parseBodyComposition,
  parseDailySummary,
  parseDevices,
  parseLastUsed,
  parseSleep,
  parseTrainingReadiness,
} from '../src/metrics.js';
import { CookieJar } from '../src/garmin/http.js';
import { TokenStore } from '../src/garmin/tokenStore.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// --- i18n --------------------------------------------------------------------

test('every message exists in the four languages, with the same placeholders', () => {
  const placeholders = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [key, entry] of Object.entries(MESSAGES)) {
    assert.deepEqual(Object.keys(entry).sort(), [...LANGUAGES].sort(), key);
    for (const language of LANGUAGES) {
      assert.deepEqual(placeholders(entry[language]), placeholders(entry.en), `${key}.${language}`);
    }
  }
});

test('msg fills the placeholders, text picks one language with English fallback', () => {
  assert.equal(
    msg('action_synced', { devices: 2, steps: 10 }).fr,
    'Synchronisé : 2 appareil(s), 10 pas aujourd’hui.',
  );
  assert.equal(text('feature_steps', 'de'), 'Schritte');
  assert.equal(text('feature_steps', 'it'), 'Steps');
  assert.throws(() => msg('nope'), /Unknown message key/);
});

// --- config ------------------------------------------------------------------

test('normalizeConfig returns the defaults when called with no argument', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('normalizeConfig coerces and bounds the user values', () => {
  const config = normalizeConfig({
    email: '  jane@example.com ',
    poll_frequency: '60',
    body_battery_low_threshold: '35',
    domain: 'evil.example',
    timezone: 'Not/AZone',
    device_language: 'it',
  });
  assert.equal(config.email, 'jane@example.com');
  assert.equal(config.poll_frequency, 300, 'five minutes minimum');
  assert.equal(config.body_battery_low_threshold, 35);
  assert.equal(config.domain, 'garmin.com');
  assert.equal(config.timezone, 'Europe/Paris');
  assert.equal(config.device_language, 'en');
});

// --- metrics -----------------------------------------------------------------

test('parseDailySummary converts units and ignores "no data" markers', () => {
  const values = parseDailySummary({
    totalSteps: 1200,
    totalDistanceMeters: 1234.5,
    averageStressLevel: -1,
    vigorousIntensityMinutes: 5,
  });
  assert.equal(values.steps, 1200);
  assert.equal(values.distance_km, 1.23);
  assert.equal(values.stress_average, null);
  assert.equal(values.intensity_minutes, 10);
  assert.equal(values.body_battery, null);
  assert.deepEqual(parseDailySummary(null), {});
});

test('parseSleep, parseTrainingReadiness and parseBodyComposition', () => {
  assert.deepEqual(parseSleep({ dailySleepDTO: { sleepTimeSeconds: 0 } }), {
    sleep_hours: null,
    sleep_score: null,
    sleep_date: null,
  });
  assert.equal(
    parseTrainingReadiness([
      { score: 40, timestamp: '2026-10-15T05:00:00' },
      { score: 70, timestamp: '2026-10-15T09:00:00' },
    ]).training_readiness,
    70,
  );
  assert.deepEqual(parseBodyComposition({ dateWeightList: [] }), {});
  assert.equal(
    parseBodyComposition({ dateWeightList: [{ date: 1, weight: 80250 }] }).weight_kg,
    80.25,
  );
});

test('activities are grouped into families and sorted newest first', () => {
  assert.equal(activityFamily('trail_running'), 'running');
  assert.equal(activityFamily('road_biking'), 'cycling');
  assert.equal(activityFamily('open_water_swimming'), 'swimming');
  assert.equal(activityFamily('yoga'), 'other');
  const [first, second] = parseActivities([
    { activityId: 1, startTimeGMT: '2026-10-14 08:00:00', activityType: { typeKey: 'walking' } },
    { activityId: 2, startTimeGMT: '2026-10-15 08:00:00', activityType: { typeKey: 'hiking' } },
    { activityName: 'no id' },
  ]);
  assert.equal(first.id, '2');
  assert.equal(second.type, 'walking');
});

test('devices and last used device', () => {
  assert.deepEqual(parseDevices([{ deviceId: 5, productDisplayName: 'Edge 1050' }, {}]), [
    { id: '5', name: 'Edge 1050', model: 'Edge 1050', firmware: null, part_number: null },
  ]);
  assert.deepEqual(parseLastUsed({ userDeviceId: 5, lastUsedDeviceUploadTime: 1000 }), {
    device_id: '5',
    upload_time: 1000,
  });
  assert.equal(parseLastUsed({}), null);
});

test('localDate follows the time zone', () => {
  const instant = new Date('2026-10-15T23:30:00Z');
  assert.equal(localDate('Europe/Paris', instant), '2026-10-16');
  assert.equal(localDate('America/New_York', instant), '2026-10-15');
});

// --- HTTP & storage -----------------------------------------------------------

test('the cookie jar keeps, replaces and deletes cookies', () => {
  const jar = new CookieJar();
  const response = (cookies) => ({ headers: { getSetCookie: () => cookies } });
  jar.store(response(['A=1; Path=/', 'B=2; HttpOnly']));
  jar.store(response(['A=3', 'B=; Max-Age=0']));
  assert.equal(jar.header(), 'A=3');
});

test('the token store is bound to the account it was opened for', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'garmin-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new TokenStore(dir);
  const account = { email: 'Jane@Example.com', domain: 'garmin.com' };
  await store.save(account, { access_token: 'a', refresh_token: 'r' });
  assert.equal((await store.load({ ...account, email: 'jane@example.com' })).access_token, 'a');
  assert.equal(await store.load({ ...account, email: 'other@example.com' }), null);
  assert.equal(await store.load({ ...account, domain: 'garmin.cn' }), null);
  await store.clear();
  assert.equal(await store.load(account), null);
});

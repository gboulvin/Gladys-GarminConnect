import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { setup } from './helpers/setup.js';
import {
  ACTIVITY_COUNTS,
  TREND_METRICS,
  TREND_PERIODS,
  WIDGETS,
  WIDGET_KEYS,
  refreshWidgets,
} from '../src/widgets.js';
import { buildDiscoveredDevices } from '../src/devices/index.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const widgetDeclaration = (key) => manifest.widgets.find((widget) => widget.key === key);
const settingOptions = (key, setting) =>
  widgetDeclaration(key)
    .settings.find((field) => field.key === setting)
    .options.map((option) => option.value);

async function content(gladys, key, settings = {}) {
  const ack = await gladys.fake.widgetGet(key, { settings, language: 'fr', units: 'metric' });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content ?? ack.data;
}

test('every widget content is rendered exactly as sent', async (t) => {
  const { gladys } = await setup(t);
  const cases = [
    [WIDGET_KEYS.DAILY_SUMMARY, {}],
    ...ACTIVITY_COUNTS.map((count) => [WIDGET_KEYS.RECENT_ACTIVITIES, { count }]),
    ...Object.keys(TREND_METRICS).flatMap((metric) =>
      TREND_PERIODS.map((period) => [WIDGET_KEYS.HEALTH_TREND, { metric, period }]),
    ),
  ];
  for (const [key, settings] of cases) {
    assert.deepEqual(
      validateWidgetContent(await content(gladys, key, settings)),
      [],
      `${key} ${JSON.stringify(settings)}`,
    );
  }
});

test('the widgets explain how to connect before the first sync', async (t) => {
  const { gladys } = await setup(t, { config: {} });
  for (const key of Object.values(WIDGET_KEYS)) {
    const widget = await content(gladys, key);
    assert.deepEqual(validateWidgetContent(widget), []);
    assert.match(widget.components[0].text.fr, /Pas encore connecté/);
  }
});

test('live tiles and charts reference features the integration publishes', async (t) => {
  const { gladys, service } = await setup(t);
  const featureIds = new Set(
    buildDiscoveredDevices(gladys, service.snapshot, 'en').flatMap((device) =>
      device.features.map((feature) => feature.external_id),
    ),
  );
  const daily = await content(gladys, WIDGET_KEYS.DAILY_SUMMARY);
  const tiles = daily.components.filter((component) => component.device_feature);
  assert.equal(tiles.length, 6);
  for (const tile of tiles) {
    assert.ok(featureIds.has(tile.device_feature), tile.device_feature);
  }
  for (const metric of Object.keys(TREND_METRICS)) {
    const [chart] = (await content(gladys, WIDGET_KEYS.HEALTH_TREND, { metric })).components;
    assert.ok(featureIds.has(chart.device_features[0]), metric);
  }
});

test('the widget settings and the code offer the same choices', () => {
  assert.deepEqual(settingOptions(WIDGET_KEYS.RECENT_ACTIVITIES, 'count'), ACTIVITY_COUNTS);
  assert.deepEqual(settingOptions(WIDGET_KEYS.HEALTH_TREND, 'metric'), Object.keys(TREND_METRICS));
  assert.deepEqual(settingOptions(WIDGET_KEYS.HEALTH_TREND, 'period'), TREND_PERIODS);
});

test('recent activities: one item per activity, linking to Garmin Connect', async (t) => {
  const { gladys } = await setup(t);
  const [list] = (await content(gladys, WIDGET_KEYS.RECENT_ACTIVITIES, { count: '3' })).components;
  assert.equal(list.type, 'card-list');
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].title, 'Morning Run');
  assert.equal(list.items[0].subtitle.fr, 'Course à pied');
  assert.equal(list.items[0].links[0].url, 'https://connect.garmin.com/modern/activity/111');
  assert.match(list.items[0].description.fr, /Fréquence cardiaque moyenne : 148 bpm/);
});

test('the Sync button synchronizes and answers a toast', async (t) => {
  const { gladys, garmin } = await setup(t);
  const daily = await content(gladys, WIDGET_KEYS.DAILY_SUMMARY);
  const button = daily.components.find((component) => component.type === 'button');
  const calls = garmin.state.requests.length;
  const ack = await gladys.fake.widgetAction(WIDGET_KEYS.DAILY_SUMMARY, button.action.key, {}, {});
  assert.equal(ack.success, true);
  assert.ok(garmin.state.requests.length > calls, 'Garmin was read again');
  const toast = ack.data.message ?? ack.data;
  assert.ok(toast.en.length <= 200);

  const unknown = await gladys.fake.widgetAction(WIDGET_KEYS.DAILY_SUMMARY, 'nope', {}, {});
  assert.equal(unknown.success, false);
});

test('every declared widget has a handler, and vice versa; refresh nudges them all', () => {
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key).sort(),
    Object.keys(WIDGETS).sort(),
  );
  const nudged = [];
  refreshWidgets({ requestWidgetRefresh: (key) => nudged.push(key) });
  assert.deepEqual(nudged, Object.keys(WIDGETS));
});

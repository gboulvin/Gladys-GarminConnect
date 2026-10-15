// -----------------------------------------------------------------------------
// Consistency checks between gladys-assistant-integration.json and the code.
// The store indexer validates the manifest itself, but nothing there knows
// which handlers the code registers, nor the four languages we promise.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../src/app.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';
import { TRIGGERS } from '../src/events.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const allFields = [
  ...manifest.config_schema,
  ...[...manifest.actions, ...manifest.scene_triggers, ...manifest.scene_actions].flatMap(
    (item) => item.fields ?? [],
  ),
  ...manifest.widgets.flatMap((widget) => widget.settings ?? []),
];

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

/** Every multi-language object of the manifest, with its path. */
function* multiLanguageTexts(node, at = '') {
  if (Array.isArray(node)) {
    for (const [index, child] of node.entries()) {
      yield* multiLanguageTexts(child, `${at}[${index}]`);
    }
  } else if (node && typeof node === 'object') {
    if (typeof node.en === 'string') {
      yield [at, node];
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      yield* multiLanguageTexts(child, `${at}.${key}`);
    }
  }
}

test('every text of the manifest exists in English, French, German and Spanish', () => {
  const texts = [...multiLanguageTexts(manifest)];
  assert.ok(texts.length > 100);
  for (const [at, value] of texts) {
    assert.deepEqual(Object.keys(value).sort(), [...LANGUAGES].sort(), at);
    for (const language of LANGUAGES) {
      assert.ok(value[language].trim().length > 0, `${at}.${language} is empty`);
    }
  }
});

test('every manifest action, scene action and widget has a handler', async () => {
  const gladys = createFakeGladys();
  createApp(gladys);
  for (const key of keysOf(manifest.actions)) {
    const ack = await gladys.fake.action(key, {});
    assert.notEqual(ack.error, 'not implemented', `action "${key}" has no handler`);
  }
  for (const key of keysOf(manifest.widgets)) {
    const ack = await gladys.fake.widgetGet(key, { settings: {}, language: 'en', units: 'metric' });
    assert.equal(ack.success, true, `widget "${key}"`);
  }
});

test('the scene triggers the code fires are exactly the declared ones', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(TRIGGERS).sort());
});

test('scene triggers, actions and widgets require Gladys >= 5.1.0', () => {
  const [major, minor] = minGladysVersion();
  assert.ok(major > 5 || (major === 5 && minor >= 1), manifest.gladys_version);
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
});

test('Garmin Connect is a cloud service', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') {
      assert.equal(field.default, undefined);
      assert.ok(!(field.key in DEFAULT_CONFIG));
      continue;
    }
    assert.ok(field.key in DEFAULT_CONFIG, `DEFAULT_CONFIG lacks "${field.key}"`);
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, field.key);
    }
  }
});

test('the password is a secret field', () => {
  const password = manifest.config_schema.find((field) => field.key === 'password');
  assert.equal(password.type, 'secret');
});

test('dynamic selects declare a source and no static options', () => {
  for (const field of allFields.filter((candidate) => candidate.source !== undefined)) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, field.key);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`), manifest.docker_image);
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [language, value] of Object.entries(manifest.description)) {
    assert.ok(value.length >= 10 && value.length <= 100, `${language}: ${value.length}`);
  }
});

test('placeholders are multi-language objects, section links https', () => {
  for (const field of allFields.filter((candidate) => candidate.placeholder !== undefined)) {
    assert.equal(typeof field.placeholder, 'object', field.key);
  }
  for (const section of manifest.config_schema.filter((field) => field.type === 'section')) {
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
    for (const value of Object.values(section.description)) {
      assert.ok(value.length <= 1000);
    }
  }
});

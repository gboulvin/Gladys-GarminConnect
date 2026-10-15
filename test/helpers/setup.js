import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../../src/app.js';
import { GarminService } from '../../src/garmin/service.js';
import { GarminAuth } from '../../src/garmin/auth.js';
import { TokenStore } from '../../src/garmin/tokenStore.js';
import { createFakeGarmin } from './fakeGarmin.js';

export const CONFIG = {
  email: 'jane@example.com',
  password: 'correct horse',
  timezone: 'Europe/Paris',
  device_language: 'fr',
};

/**
 * A connected integration: fake Gladys + fake Garmin + a temporary /data.
 * Call `cleanup()` at the end (registered with t.after).
 */
export async function setup(
  t,
  {
    garmin: garminOverrides = {},
    fakeGarmin,
    config = CONFIG,
    connect = true,
    dataDir: sharedDir,
  } = {},
) {
  const garmin = fakeGarmin ?? createFakeGarmin(garminOverrides);
  t.mock.method(globalThis, 'fetch', garmin.fetch);
  const dataDir = sharedDir ?? (await mkdtemp(path.join(tmpdir(), 'garmin-test-')));
  const tokenStore = new TokenStore(dataDir);
  const service = new GarminService({
    tokenStore,
    createAuth: (domain) => new GarminAuth({ domain, portalDelayMs: 0 }),
  });
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, { service });
  t.after(async () => {
    app.stop();
    await rm(dataDir, { recursive: true, force: true });
  });
  if (connect) {
    await gladys.connect();
  }
  return { garmin, gladys, app, service, tokenStore, dataDir };
}

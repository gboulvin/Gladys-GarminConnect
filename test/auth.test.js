import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GarminAuth, decodeJwtPayload, tokensExpireSoon } from '../src/garmin/auth.js';
import { GarminApi } from '../src/garmin/api.js';
import {
  GarminAuthError,
  GarminBlockedError,
  GarminMfaRequiredError,
} from '../src/garmin/errors.js';
import { createFakeGarmin, jwt } from './helpers/fakeGarmin.js';

const EMAIL = 'jane@example.com';
const PASSWORD = 'correct horse';

test('the mobile flow exchanges the service ticket for DI tokens', async (t) => {
  const garmin = createFakeGarmin();
  t.mock.method(globalThis, 'fetch', garmin.fetch);
  const tokens = await new GarminAuth().login(EMAIL, PASSWORD);

  assert.ok(tokens.access_token);
  assert.equal(tokens.refresh_token, 'refresh-1');
  assert.equal(tokens.client_id, 'GARMIN_CONNECT_MOBILE_ANDROID_DI_2025Q2');
  assert.ok(tokens.expires_at > Date.now());
  const login = garmin.state.requests.find((r) => r.url.includes('/mobile/api/login'));
  assert.match(login.url, /clientId=GCM_IOS_DARK/);
});

test('refused credentials stop at once, without trying the portal flow', async (t) => {
  const garmin = createFakeGarmin({ password: 'another one' });
  t.mock.method(globalThis, 'fetch', garmin.fetch);
  await assert.rejects(new GarminAuth().login(EMAIL, PASSWORD), GarminAuthError);
  assert.equal(garmin.state.loginCount, 1);
});

test('a blocked mobile flow falls back to the portal flow', async (t) => {
  const garmin = createFakeGarmin({ blockMobile: true });
  t.mock.method(globalThis, 'fetch', garmin.fetch);
  const tokens = await new GarminAuth({ portalDelayMs: 0 }).login(EMAIL, PASSWORD);
  assert.ok(tokens.access_token);
  assert.ok(garmin.state.requests.some((r) => r.url.includes('/portal/api/login')));
});

test('MFA: the code is verified on the same SSO session', async (t) => {
  const garmin = createFakeGarmin({ mfa: true });
  t.mock.method(globalThis, 'fetch', garmin.fetch);
  const auth = new GarminAuth();

  await assert.rejects(auth.login(EMAIL, PASSWORD), GarminMfaRequiredError);
  assert.equal(auth.mfaPending, true);

  // A wrong code keeps the conversation open.
  await assert.rejects(auth.submitMfaCode('000000'), GarminAuthError);
  assert.equal(auth.mfaPending, true);

  const tokens = await auth.submitMfaCode(' 123456 ');
  assert.ok(tokens.access_token);
  assert.equal(auth.mfaPending, false);
});

test('submitting a code without a pending sign-in fails clearly', async () => {
  await assert.rejects(new GarminAuth().submitMfaCode('123456'), /No Garmin sign-in is waiting/);
});

test('every flow blocked ends in GarminBlockedError', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('Too many', { status: 429 }));
  await assert.rejects(
    new GarminAuth({ portalDelayMs: 0 }).login(EMAIL, PASSWORD),
    GarminBlockedError,
  );
});

test('refresh keeps the previous refresh token when Garmin sends none', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ access_token: jwt({ exp: Math.floor(Date.now() / 1000) + 3600 }) }),
  );
  const tokens = await new GarminAuth().refresh({
    access_token: 'old',
    refresh_token: 'keep-me',
    client_id: 'GARMIN_CONNECT_MOBILE_ANDROID_DI',
  });
  assert.equal(tokens.refresh_token, 'keep-me');
  assert.equal(tokens.client_id, 'GARMIN_CONNECT_MOBILE_ANDROID_DI');
});

test('only the official Garmin domains are accepted', () => {
  assert.throws(() => new GarminAuth({ domain: 'evil.example' }), /Invalid Garmin domain/);
  assert.equal(new GarminAuth({ domain: 'garmin.cn' }).diTokenUrl.includes('garmin.cn'), true);
});

test('JWT helpers', () => {
  assert.deepEqual(decodeJwtPayload(jwt({ exp: 10 })), { exp: 10 });
  assert.equal(decodeJwtPayload('not a jwt'), null);
  const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{}').toString('base64url')}.`;
  assert.equal(decodeJwtPayload(unsigned), null);
  assert.equal(tokensExpireSoon({ expires_at: Date.now() + 60 * 60 * 1000 }), false);
  assert.equal(tokensExpireSoon({ expires_at: Date.now() + 60 * 1000 }), true);
});

test('the API refreshes an expired token once and retries the call', async (t) => {
  const garmin = createFakeGarmin();
  t.mock.method(globalThis, 'fetch', garmin.fetch);
  const auth = new GarminAuth();
  const saved = [];
  const api = new GarminApi({
    auth,
    tokens: await auth.login(EMAIL, PASSWORD),
    onTokens: async (tokens) => saved.push(tokens),
  });
  garmin.state.rejectNextApiCall = true;

  const profile = await api.getSocialProfile();
  assert.equal(profile.displayName, 'jdoe');
  assert.equal(garmin.state.refreshCount, 1);
  assert.equal(saved.length, 1, 'the refreshed tokens are persisted');
});

test('the API refreshes ahead of the expiry', async (t) => {
  const garmin = createFakeGarmin({ accessTokenTtlSeconds: 60 });
  t.mock.method(globalThis, 'fetch', garmin.fetch);
  const auth = new GarminAuth();
  const api = new GarminApi({ auth, tokens: await auth.login(EMAIL, PASSWORD) });
  await api.getDevices();
  assert.equal(garmin.state.refreshCount, 1);
});

test('a refused refresh is an auth error; a missing resource is null', async (t) => {
  const garmin = createFakeGarmin();
  t.mock.method(globalThis, 'fetch', garmin.fetch);
  const auth = new GarminAuth();
  const api = new GarminApi({ auth, tokens: await auth.login(EMAIL, PASSWORD) });

  assert.equal(await api.get('/does-not-exist'), null);

  garmin.state.rejectNextApiCall = true;
  garmin.state.refreshRefused = true;
  await assert.rejects(api.getDevices(), GarminAuthError);
});

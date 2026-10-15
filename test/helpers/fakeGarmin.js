// -----------------------------------------------------------------------------
// An in-memory Garmin Connect, answering the `fetch` calls of the integration
// (SSO, DI token host, API tier). Tests never touch the network: install it
// with `t.mock.method(globalThis, 'fetch', garmin.fetch)`.
// -----------------------------------------------------------------------------

export function jwt(payload) {
  const encode = (part) => Buffer.from(JSON.stringify(part)).toString('base64url');
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

export const TODAY = '2026-10-15';

export function createFakeGarmin(overrides = {}) {
  const state = {
    email: 'jane@example.com',
    password: 'correct horse',
    mfa: false, // the account requires a verification code
    mfaCode: '123456',
    blockMobile: false, // the mobile flow answers 403 (Cloudflare)
    loginCount: 0,
    tokenCount: 0,
    refreshCount: 0,
    rejectNextApiCall: false, // the next API call answers 401 (expired token)
    refreshRefused: false,
    accessTokenTtlSeconds: 3600,
    requests: [],
    profile: { profileId: 12345, displayName: 'jdoe', fullName: 'Jane Doe' },
    devices: [
      {
        deviceId: 3456,
        displayName: 'Forerunner 265',
        productDisplayName: 'Forerunner 265',
        currentFirmwareVersion: '21.19',
      },
      { deviceId: 7890, productDisplayName: 'Index S2' },
    ],
    lastUsed: { userDeviceId: 3456, lastUsedDeviceUploadTime: Date.now() - 10 * 60 * 1000 },
    summary: {
      totalSteps: 8500,
      dailyStepGoal: 10000,
      totalDistanceMeters: 6543,
      activeKilocalories: 412.6,
      floorsAscended: 7.2,
      moderateIntensityMinutes: 20,
      vigorousIntensityMinutes: 10,
      restingHeartRate: 52,
      averageStressLevel: 31,
      bodyBatteryMostRecentValue: 64,
      averageSpo2: 96,
      avgWakingRespirationValue: 14.5,
    },
    sleep: {
      dailySleepDTO: {
        calendarDate: TODAY,
        sleepTimeSeconds: 27000,
        sleepScores: { overall: { value: 82 } },
      },
    },
    hrv: { hrvSummary: { lastNightAvg: 48 } },
    readiness: [{ score: 71, timestamp: `${TODAY}T06:00:00.0` }],
    composition: {
      dateWeightList: [
        { date: 1760000000000, weight: 70500, bmi: 22.4, bodyFat: 18.2 },
        { date: 1759000000000, weight: 71000, bmi: 22.6, bodyFat: 18.5 },
      ],
    },
    activities: [
      {
        activityId: 111,
        activityName: 'Morning Run',
        activityType: { typeKey: 'running' },
        startTimeGMT: `${TODAY} 06:30:00`,
        distance: 10234,
        duration: 3125,
        calories: 640,
        averageHR: 148,
      },
    ],
    ...overrides,
  };

  const json = (body, status = 200, headers = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    });

  function issueTokens() {
    state.tokenCount += 1;
    return {
      access_token: jwt({
        exp: Math.floor(Date.now() / 1000) + state.accessTokenTtlSeconds,
        client_id: 'GARMIN_CONNECT_MOBILE_ANDROID_DI_2025Q2',
        n: state.tokenCount,
      }),
      refresh_token: `refresh-${state.tokenCount}`,
      expires_in: state.accessTokenTtlSeconds,
    };
  }

  function currentAccessToken() {
    return jwt({
      exp: Math.floor(Date.now() / 1000) + state.accessTokenTtlSeconds,
      client_id: 'GARMIN_CONNECT_MOBILE_ANDROID_DI_2025Q2',
      n: state.tokenCount,
    });
  }

  async function fetch(input, init = {}) {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    const headers = init.headers ?? {};
    state.requests.push({ method, url: url.toString(), headers, body: init.body });

    // --- SSO ---------------------------------------------------------------
    if (url.hostname === 'sso.garmin.com') {
      if (url.pathname === '/portal/sso/en-US/sign-in') {
        return new Response('<html></html>', { status: 200 });
      }
      if (/^\/(mobile|portal)\/api\/login$/.test(url.pathname)) {
        if (state.blockMobile && url.pathname.startsWith('/mobile')) {
          return new Response('blocked', { status: 403 });
        }
        state.loginCount += 1;
        const body = JSON.parse(init.body);
        if (body.username !== state.email || body.password !== state.password) {
          return json({ responseStatus: { type: 'INVALID_USERNAME_PASSWORD' } });
        }
        if (state.mfa) {
          return json(
            {
              responseStatus: { type: 'MFA_REQUIRED' },
              customerMfaInfo: { mfaLastMethodUsed: 'email' },
            },
            200,
            { 'Set-Cookie': 'SESSION=mfa-session; Path=/; HttpOnly' },
          );
        }
        return json({ responseStatus: { type: 'SUCCESSFUL' }, serviceTicketId: 'ST-123' });
      }
      if (/^\/(mobile|portal)\/api\/mfa\/verifyCode$/.test(url.pathname)) {
        const body = JSON.parse(init.body);
        if (headers.Cookie !== 'SESSION=mfa-session') {
          return json({ responseStatus: { type: 'SESSION_EXPIRED' } });
        }
        if (body.mfaVerificationCode !== state.mfaCode) {
          return json({ responseStatus: { type: 'INVALID_MFA_CODE' } });
        }
        return json({ responseStatus: { type: 'SUCCESSFUL' }, serviceTicketId: 'ST-MFA' });
      }
    }

    // --- DI token host -------------------------------------------------------
    if (url.hostname === 'diauth.garmin.com') {
      const form = new URLSearchParams(init.body);
      if (form.get('grant_type') === 'refresh_token') {
        state.refreshCount += 1;
        if (state.refreshRefused) {
          return json({ error: 'invalid_grant' }, 400);
        }
        return json(issueTokens());
      }
      if (!form.get('service_ticket')?.startsWith('ST-')) {
        return json({ error: 'invalid_grant' }, 400);
      }
      return json(issueTokens());
    }

    // --- API tier --------------------------------------------------------------
    if (url.hostname === 'connectapi.garmin.com') {
      if (!String(headers.Authorization ?? '').startsWith('Bearer ')) {
        return json({ message: 'unauthorized' }, 401);
      }
      if (state.rejectNextApiCall) {
        state.rejectNextApiCall = false;
        return json({ message: 'Token is not active' }, 401);
      }
      const routes = [
        ['/userprofile-service/socialProfile', () => state.profile],
        ['/device-service/deviceregistration/devices', () => state.devices],
        ['/device-service/deviceservice/mylastused', () => state.lastUsed],
        ['/usersummary-service/usersummary/daily/jdoe', () => state.summary],
        ['/wellness-service/wellness/dailySleepData/jdoe', () => state.sleep],
        [/^\/hrv-service\/hrv\//, () => state.hrv],
        [/^\/metrics-service\/metrics\/trainingreadiness\//, () => state.readiness],
        ['/weight-service/weight/dateRange', () => state.composition],
        ['/activitylist-service/activities/search/activities', () => state.activities],
      ];
      const route = routes.find(([path]) =>
        typeof path === 'string' ? path === url.pathname : path.test(url.pathname),
      );
      if (!route) {
        return json({ message: 'not found' }, 404);
      }
      const body = route[1]();
      return body === null ? new Response(null, { status: 204 }) : json(body);
    }

    throw new Error(`Unexpected request to ${url}`);
  }

  return { state, fetch, issueTokens, currentAccessToken };
}

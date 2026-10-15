// -----------------------------------------------------------------------------
// The integration, wired to a Gladys client (the real one in index.js, the
// SDK's fake Gladys in the tests): handlers, synchronization loop, publication
// of devices, states and scene events.
//
// One synchronization = one Garmin snapshot (src/garmin/service.js), then:
//   1. the device list, re-published when it changed (new watch, language);
//   2. the states that changed (publishChangedStates, 30 min heartbeat);
//   3. the scene events since the previous snapshot;
//   4. the connection status and a widget refresh nudge.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { hasCredentials, normalizeConfig } from './config.js';
import { msg } from './i18n.js';
import { GarminMfaRequiredError } from './garmin/errors.js';
import { GarminService, GarminSignInNeededError, STATUS } from './garmin/service.js';
import { buildDiscoveredDevices, buildStates, deviceExternalIdOf } from './devices/index.js';
import { SCENE_ACTIONS } from './scenes.js';
import { WIDGETS, refreshWidgets } from './widgets.js';

const logger = createLogger({ name: 'garmin-connect' });

// Re-send an unchanged value this often, so a stable value stays recently
// dated in Gladys.
export const STATE_HEARTBEAT_MS = 30 * 60 * 1000;

/** Connection status message shown in the Configuration screen. */
export function statusMessage(service) {
  switch (service.status) {
    case STATUS.NOT_CONFIGURED:
      return msg('status_not_configured');
    case STATUS.MFA_REQUIRED:
      return msg('status_mfa_required');
    case STATUS.AUTH_FAILED:
      return msg('status_auth_failed');
    case STATUS.SESSION_EXPIRED:
      return msg('status_session_expired');
    case STATUS.BLOCKED:
      return msg('status_blocked');
    default:
      return msg('status_unreachable', { error: service.lastError?.message ?? 'unknown error' });
  }
}

/** `YYYY-MM-DD HH:mm` in the account time zone (language neutral). */
export function formatTimestamp(timestamp, timeZone) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

export function createApp(gladys, { service = new GarminService() } = {}) {
  const app = {
    gladys,
    service,
    config: normalizeConfig(),
    timer: null,
    publishedDevicesKey: null,
  };

  // --- Synchronization -------------------------------------------------------

  async function publishDevicesIfChanged(snapshot, force = false) {
    const devices = buildDiscoveredDevices(gladys, snapshot, app.config.device_language);
    const key = JSON.stringify(devices);
    if (force || key !== app.publishedDevicesKey) {
      await gladys.publishDiscoveredDevices(devices);
      app.publishedDevicesKey = key;
    }
  }

  async function reportFailure(err) {
    if (err instanceof GarminSignInNeededError || err instanceof GarminMfaRequiredError) {
      logger.warn(`Garmin Connect: ${err.message}`);
    } else {
      logger.error('Garmin Connect synchronization failed', err);
    }
    await gladys.setConnectionStatus(false, statusMessage(service)).catch(() => {});
  }

  /** Synchronize now; rejects when Garmin could not be read (status reported). */
  app.synchronize = async (reason = 'timer') => {
    logger.debug(`Synchronization (${reason})`);
    let result;
    try {
      result = await service.sync({
        deviceExternalId: (garminDeviceId) => deviceExternalIdOf(gladys, garminDeviceId),
      });
    } catch (err) {
      await reportFailure(err);
      throw err;
    }
    const { snapshot, events } = result;
    await publishDevicesIfChanged(snapshot);
    await gladys.publishChangedStates(buildStates(gladys, snapshot), {
      heartbeat: STATE_HEARTBEAT_MS,
    });
    for (const event of events) {
      logger.info(`Scene event ${event.key}`);
      await gladys
        .publishSceneEvent(event.key, event.data)
        .catch((err) => logger.error(`Scene event ${event.key} refused`, err));
    }
    await gladys.setConnectionStatus(true);
    refreshWidgets(gladys);
    return result;
  };

  // The integration drives its own timer: Gladys would poll every minute at
  // most, Garmin wants far fewer calls (poll_frequency, 5 minutes minimum).
  function scheduleNext(delayMs = app.config.poll_frequency * 1000) {
    stopTimer();
    app.timer = setTimeout(async () => {
      app.timer = null;
      await app.synchronize('timer').catch(() => {});
      scheduleNext();
    }, delayMs);
    app.timer.unref?.();
  }

  function stopTimer() {
    if (app.timer) {
      clearTimeout(app.timer);
      app.timer = null;
    }
  }

  async function applyConfig(rawConfig) {
    app.config = normalizeConfig(rawConfig);
    service.configure(app.config);
  }

  /** (Re)start: first synchronization now, then at the configured interval. */
  async function start() {
    if (!hasCredentials(app.config)) {
      await reportFailure(new GarminSignInNeededError(STATUS.NOT_CONFIGURED));
      stopTimer();
      return;
    }
    await app.synchronize('start').catch(() => {});
    scheduleNext();
  }

  app.start = start;
  app.stop = stopTimer;

  // --- Gladys events ---------------------------------------------------------

  gladys.onScanRequest(async () => {
    logger.info('onScanRequest -> synchronizing then publishing the devices');
    if (service.snapshot === null && hasCredentials(app.config)) {
      await app.synchronize('scan').catch(() => {});
    }
    await publishDevicesIfChanged(service.snapshot, true);
  });

  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('onConfigUpdated -> new configuration received');
    const previousLanguage = app.config.device_language;
    await applyConfig(newConfig);
    if (previousLanguage !== app.config.device_language) {
      app.publishedDevicesKey = null; // names changed: publish again
    }
    await start();
    refreshWidgets(gladys);
  });

  // The user created, updated or deleted a device: the SDK forgot its
  // published values, publish them again right away.
  const republishStates = async () => {
    if (service.snapshot) {
      await gladys.publishChangedStates(buildStates(gladys, service.snapshot), {
        heartbeat: STATE_HEARTBEAT_MS,
      });
    }
  };
  gladys.onDeviceCreated(republishStates);
  gladys.onDeviceUpdated(republishStates);

  // --- Configuration screen actions ------------------------------------------

  gladys.onAction('sign_in', async (fields) => {
    if (!hasCredentials(app.config)) {
      return msg('action_missing_credentials');
    }
    const code = String(fields?.mfa_code ?? '').trim();
    if (code && !service.auth?.mfaPending) {
      return msg('action_mfa_no_pending');
    }
    try {
      await service.signIn(code);
    } catch (err) {
      if (err instanceof GarminMfaRequiredError) {
        await reportFailure(err);
        return msg('action_mfa_sent', { method: service.auth.pendingMfa?.method ?? err.method });
      }
      await reportFailure(err);
      return statusMessage(service);
    }
    let snapshot;
    try {
      ({ snapshot } = await app.synchronize('sign-in'));
    } catch {
      return statusMessage(service);
    }
    scheduleNext();
    return msg('action_signed_in', {
      name: snapshot.profile.full_name,
      devices: snapshot.devices.length,
    });
  });

  gladys.onAction('test_connection', async () => {
    try {
      const { snapshot } = await app.synchronize('test');
      return msg('action_test_ok', {
        name: snapshot.profile.full_name,
        steps: snapshot.metrics.steps ?? 0,
        time: snapshot.last_used
          ? formatTimestamp(snapshot.last_used.upload_time, app.config.timezone)
          : '-',
      });
    } catch {
      return statusMessage(service);
    }
  });

  gladys.onAction('sync_now', async () => {
    try {
      const { snapshot } = await app.synchronize('action');
      return msg('action_synced', {
        devices: snapshot.devices.length,
        steps: snapshot.metrics.steps ?? 0,
      });
    } catch {
      return statusMessage(service);
    }
  });

  gladys.onAction('sign_out', async () => {
    stopTimer();
    await service.signOut();
    await gladys.setConnectionStatus(false, statusMessage(service)).catch(() => {});
    refreshWidgets(gladys);
    return msg('action_signed_out');
  });

  // --- Scene actions and widgets ---------------------------------------------

  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => handler(app, { fields: fields ?? {} }));
  }

  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => widget.get(app, request ?? {}));
    if (typeof widget.action === 'function') {
      gladys.onWidgetAction(key, (actionKey, params, { settings } = {}) =>
        widget.action(app, { actionKey, params, settings }),
      );
    }
  }

  // --- Connection lifecycle --------------------------------------------------

  gladys.on('connected', async () => {
    try {
      await applyConfig(await gladys.getConfig());
      // A reconnection may follow a Gladys restart: publish the list again.
      app.publishedDevicesKey = null;
      await start();
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
    }
  });

  gladys.on('disconnected', stopTimer);

  return app;
}

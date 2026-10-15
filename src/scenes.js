// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// Operations a scene author places in a scene, each returning SCALAR outputs
// the following actions read ({{...}} variables) and gate on. A scene action
// is never a condition: a failed Garmin call that can be reported as an output
// (`synced: false`, `found: false`) is an output, not a throw. A value Garmin
// did not give is left out (the core reads it as null).
//
// Scene TRIGGERS go the other way ("this happened"): see src/events.js.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'scenes' });

const SUMMARY_OUTPUTS = [
  'steps',
  'step_goal',
  'distance_km',
  'active_calories',
  'floors',
  'intensity_minutes',
  'resting_heart_rate',
  'stress_average',
  'body_battery',
  'sleep_hours',
  'sleep_score',
  'hrv',
  'training_readiness',
  'weight_kg',
];

const ACTIVITY_OUTPUTS = [
  'name',
  'type',
  'start_time',
  'distance_km',
  'duration_minutes',
  'calories',
  'average_hr',
];

/** Keep the defined values only: a scene output is a scalar or absent. */
function definedOnly(source, keys) {
  return Object.fromEntries(
    keys
      .filter((key) => source?.[key] !== null && source?.[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
}

/** The latest snapshot, synchronized first when asked or when there is none. */
async function freshSnapshot(app, refresh) {
  if (refresh || !app.service.snapshot) {
    await app.synchronize('scene');
  }
  return app.service.snapshot;
}

export const SCENE_ACTIONS = {
  async sync_now(app) {
    try {
      await app.synchronize('scene');
      const { metrics } = app.service.snapshot;
      return { synced: true, ...definedOnly(metrics, ['steps', 'body_battery']) };
    } catch (err) {
      logger.warn(`Scene action sync_now failed: ${err.message}`);
      return { synced: false };
    }
  },

  async get_daily_summary(app, { fields }) {
    const snapshot = await freshSnapshot(app, fields.refresh === true);
    return { date: snapshot.date, ...definedOnly(snapshot.metrics, SUMMARY_OUTPUTS) };
  },

  async get_last_activity(app, { fields }) {
    const snapshot = await freshSnapshot(app, fields.refresh === true);
    const [activity] = snapshot.activities;
    if (!activity) {
      return { found: false };
    }
    return { found: true, ...definedOnly(activity, ACTIVITY_OUTPUTS) };
  },
};

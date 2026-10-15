// -----------------------------------------------------------------------------
// Scene triggers: what HAPPENED between two synchronizations.
//
// The values themselves (steps, Body Battery...) are device features, already
// usable by the standard "device state" scene trigger. The events below say
// "this happened, with these details" and fire ONCE per transition, comparing
// the previous snapshot with the new one. The very first sync after a start
// only seeds the comparison: it never replays the past as fresh events.
//
// Keys are forever: scenes store them. Each key must be declared in the
// manifest `scene_triggers` field (test/manifest.test.js checks it).
// -----------------------------------------------------------------------------

export const TRIGGERS = {
  ACTIVITY_COMPLETED: 'activity_completed',
  STEP_GOAL_REACHED: 'step_goal_reached',
  BODY_BATTERY_LOW: 'body_battery_low',
  SLEEP_RECORDED: 'sleep_recorded',
  WEIGH_IN_RECORDED: 'weigh_in_recorded',
  DEVICE_SYNCED: 'device_synced',
};

// A burst of uploads (a watch synced after a week offline) must not flood the
// scenes: at most this many activity events per synchronization.
export const MAX_ACTIVITY_EVENTS_PER_SYNC = 5;

/**
 * Events between two snapshots (see GarminService.sync for their shape).
 * @param {object | null} previous
 * @param {object} next
 * @param {{ bodyBatteryLowThreshold: number, deviceExternalId: (id: string) => string }} options
 * @returns {{ key: string, data: Record<string, string | number | boolean | null> }[]}
 */
export function detectEvents(previous, next, { bodyBatteryLowThreshold, deviceExternalId }) {
  if (!previous) {
    return [];
  }
  return [
    ...activityEvents(previous, next),
    ...stepGoalEvents(previous, next),
    ...bodyBatteryEvents(previous, next, bodyBatteryLowThreshold),
    ...sleepEvents(previous, next),
    ...weighInEvents(previous, next),
    ...deviceSyncEvents(previous, next, deviceExternalId),
  ];
}

function activityEvents(previous, next) {
  const known = new Set(previous.activities.map((activity) => activity.id));
  const newestKnown = previous.activities[0]?.start_time ?? '';
  return next.activities
    .filter((activity) => !known.has(activity.id))
    .filter((activity) => (activity.start_time ?? '') >= newestKnown)
    .slice(0, MAX_ACTIVITY_EVENTS_PER_SYNC)
    .reverse() // oldest first, the order they happened
    .map((activity) => ({
      key: TRIGGERS.ACTIVITY_COMPLETED,
      data: {
        activity_type: activity.type,
        activity_name: activity.name,
        distance_km: activity.distance_km,
        duration_minutes: activity.duration_minutes,
        calories: activity.calories,
        average_hr: activity.average_hr,
      },
    }));
}

function stepGoalEvents(previous, next) {
  const { steps, step_goal: goal } = next.metrics;
  if (steps === null || steps === undefined || !goal || goal <= 0 || steps < goal) {
    return [];
  }
  // Steps only grow during a day: the goal is crossed once per date.
  const stepsBefore = previous.date === next.date ? (previous.metrics.steps ?? 0) : 0;
  if (stepsBefore >= goal) {
    return [];
  }
  return [{ key: TRIGGERS.STEP_GOAL_REACHED, data: { steps, step_goal: goal } }];
}

function bodyBatteryEvents(previous, next, threshold) {
  const before = previous.metrics.body_battery;
  const now = next.metrics.body_battery;
  if (now === null || now === undefined || before === null || before === undefined) {
    return [];
  }
  if (before >= threshold && now < threshold) {
    return [{ key: TRIGGERS.BODY_BATTERY_LOW, data: { body_battery: now, threshold } }];
  }
  return [];
}

function sleepEvents(previous, next) {
  const { sleep_date: date, sleep_hours: hours, sleep_score: score } = next.metrics;
  if (!date || date === previous.metrics.sleep_date) {
    return [];
  }
  return [
    {
      key: TRIGGERS.SLEEP_RECORDED,
      data: { sleep_hours: hours ?? null, sleep_score: score ?? null },
    },
  ];
}

function weighInEvents(previous, next) {
  const timestamp = next.metrics.weight_timestamp;
  if (!timestamp || timestamp === previous.metrics.weight_timestamp) {
    return [];
  }
  if (previous.metrics.weight_timestamp && timestamp < previous.metrics.weight_timestamp) {
    return []; // an older weigh-in surfaced (the latest one was deleted)
  }
  return [
    {
      key: TRIGGERS.WEIGH_IN_RECORDED,
      data: {
        weight_kg: next.metrics.weight_kg ?? null,
        body_fat: next.metrics.body_fat ?? null,
        bmi: next.metrics.bmi ?? null,
      },
    },
  ];
}

function deviceSyncEvents(previous, next, deviceExternalId) {
  const now = next.last_used;
  const before = previous.last_used;
  if (!now || (before && now.upload_time <= before.upload_time)) {
    return [];
  }
  const device = next.devices.find((candidate) => candidate.id === now.device_id);
  if (!device) {
    return [];
  }
  return [
    {
      key: TRIGGERS.DEVICE_SYNCED,
      data: { device: deviceExternalId(device.id), device_name: device.name },
    },
  ];
}

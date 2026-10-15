// -----------------------------------------------------------------------------
// Pure functions turning the raw Garmin Connect answers into the values the
// integration publishes. Garmin documents none of these payloads and they vary
// with the devices of the account (no scale -> no weight, no HRV sensor -> no
// HRV...): every value is optional and comes out as a finite number or null.
// -----------------------------------------------------------------------------

/** Finite number, or null. */
export function num(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value, decimals) {
  if (value === null) {
    return null;
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Calendar date (YYYY-MM-DD) of an instant in a time zone, UTC as fallback. */
export function localDate(timeZone, date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** True when the time zone is known to the runtime. */
export function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Values of the daily summary (steps, heart rate, stress, Body Battery...). */
export function parseDailySummary(summary) {
  if (!summary || typeof summary !== 'object') {
    return {};
  }
  const meters = num(summary.totalDistanceMeters);
  const moderate = num(summary.moderateIntensityMinutes);
  const vigorous = num(summary.vigorousIntensityMinutes);
  // Garmin counts a vigorous minute twice towards the intensity goal.
  const intensity =
    moderate === null && vigorous === null ? null : (moderate ?? 0) + 2 * (vigorous ?? 0);
  // -1/-2 stand for "not enough data" in the stress fields.
  const stress = num(summary.averageStressLevel);
  return {
    steps: num(summary.totalSteps),
    step_goal: num(summary.dailyStepGoal),
    distance_km: meters === null ? null : round(meters / 1000, 2),
    active_calories: round(num(summary.activeKilocalories), 0),
    floors: round(num(summary.floorsAscended), 0),
    intensity_minutes: intensity,
    resting_heart_rate: num(summary.restingHeartRate),
    stress_average: stress !== null && stress >= 0 ? stress : null,
    body_battery: num(summary.bodyBatteryMostRecentValue),
    spo2: num(summary.averageSpo2),
    respiration: num(summary.avgWakingRespirationValue),
  };
}

/** Last night: duration, score and its calendar date. */
export function parseSleep(sleep) {
  const dto = sleep?.dailySleepDTO;
  if (!dto || typeof dto !== 'object') {
    return {};
  }
  const seconds = num(dto.sleepTimeSeconds);
  return {
    sleep_hours: seconds === null || seconds <= 0 ? null : round(seconds / 3600, 2),
    sleep_score: num(dto.sleepScores?.overall?.value),
    sleep_date: seconds && seconds > 0 ? (dto.calendarDate ?? null) : null,
  };
}

export function parseHrv(hrv) {
  return { hrv: num(hrv?.hrvSummary?.lastNightAvg) };
}

/** The endpoint answers a list (one entry per evaluation), the latest first. */
export function parseTrainingReadiness(readiness) {
  const entries = Array.isArray(readiness) ? readiness : readiness ? [readiness] : [];
  const latest = entries
    .filter((entry) => num(entry?.score) !== null)
    .sort((a, b) => String(b.timestamp ?? '').localeCompare(String(a.timestamp ?? '')))[0];
  return { training_readiness: latest ? num(latest.score) : null };
}

/** Latest weigh-in of the range (weights are in grams). */
export function parseBodyComposition(composition) {
  const list = Array.isArray(composition?.dateWeightList) ? composition.dateWeightList : [];
  const latest = list
    .filter((entry) => num(entry?.weight) !== null)
    .sort((a, b) => (num(b.date) ?? 0) - (num(a.date) ?? 0))[0];
  if (!latest) {
    return {};
  }
  return {
    weight_kg: round(num(latest.weight) / 1000, 2),
    body_fat: round(num(latest.bodyFat), 1),
    bmi: round(num(latest.bmi), 1),
    weight_timestamp: num(latest.date) ?? num(latest.samplePk),
  };
}

// Garmin activity type keys grouped into the families a scene filters on.
const ACTIVITY_FAMILIES = [
  ['swimming', /swim/],
  ['cycling', /cycl|bik|bmx/],
  ['running', /run|track/],
  ['hiking', /hik|mountaineer/],
  ['walking', /walk/],
  ['strength', /strength|fitness_equipment|hiit|indoor_cardio/],
];

export const ACTIVITY_TYPES = [...ACTIVITY_FAMILIES.map(([family]) => family), 'other'];

export function activityFamily(typeKey) {
  const key = String(typeKey ?? '').toLowerCase();
  return ACTIVITY_FAMILIES.find(([, pattern]) => pattern.test(key))?.[0] ?? 'other';
}

/** Activities, most recent first, with the values the scenes and widgets use. */
export function parseActivities(activities) {
  if (!Array.isArray(activities)) {
    return [];
  }
  return activities
    .filter((activity) => activity?.activityId !== undefined && activity?.activityId !== null)
    .map((activity) => {
      const meters = num(activity.distance);
      const seconds = num(activity.duration);
      const startGmt = activity.startTimeGMT ? `${activity.startTimeGMT.replace(' ', 'T')}Z` : null;
      return {
        id: String(activity.activityId),
        name: String(activity.activityName ?? activity.activityType?.typeKey ?? 'Activity'),
        type_key: String(activity.activityType?.typeKey ?? 'other'),
        type: activityFamily(activity.activityType?.typeKey),
        start_time: startGmt && !Number.isNaN(Date.parse(startGmt)) ? startGmt : null,
        distance_km: meters === null ? null : round(meters / 1000, 2),
        duration_minutes: seconds === null ? null : round(seconds / 60, 1),
        calories: round(num(activity.calories), 0),
        average_hr: round(num(activity.averageHR), 0),
      };
    })
    .sort((a, b) => String(b.start_time ?? '').localeCompare(String(a.start_time ?? '')));
}

/** Registered Garmin devices (watches, bike computers, scales...). */
export function parseDevices(devices) {
  if (!Array.isArray(devices)) {
    return [];
  }
  return devices
    .filter((device) => device?.deviceId !== undefined && device?.deviceId !== null)
    .map((device) => ({
      id: String(device.deviceId),
      name: String(
        device.displayName || device.productDisplayName || `Garmin ${String(device.deviceId)}`,
      ),
      model: device.productDisplayName ? String(device.productDisplayName) : null,
      firmware:
        device.currentFirmwareVersion || device.softwareVersion
          ? String(device.currentFirmwareVersion || device.softwareVersion)
          : null,
      part_number: device.partNumber ? String(device.partNumber) : null,
    }));
}

/** The device that uploaded last, and when (epoch ms). */
export function parseLastUsed(lastUsed) {
  const id = lastUsed?.userDeviceId ?? lastUsed?.deviceId;
  const time = num(lastUsed?.lastUsedDeviceUploadTime);
  if (id === undefined || id === null || time === null) {
    return null;
  }
  return { device_id: String(id), upload_time: time };
}

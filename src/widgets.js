// -----------------------------------------------------------------------------
// Dashboard widgets (manifest `widgets`, Gladys 5.1+).
//
// The contents are declarative (the core renders them with its own theme and
// dark mode): no HTML. Texts are multi-language objects the core picks from.
//   - daily_summary     live tiles bound to the account features (they follow
//                       the published states), a status list, a Sync button;
//   - recent_activities the last activities as a list, each opening its
//                       details and a link to Garmin Connect;
//   - health_trend      the history Gladys keeps of one chosen metric.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { msg, perLanguage } from './i18n.js';
import { accountFeatureId } from './devices/index.js';
import { STATUS } from './garmin/service.js';

const logger = createLogger({ name: 'widgets' });

export const WIDGET_KEYS = {
  DAILY_SUMMARY: 'daily_summary',
  RECENT_ACTIVITIES: 'recent_activities',
  HEALTH_TREND: 'health_trend',
};

const DAILY_SUMMARY_ACTIONS = { SYNC: 'sync' };

// Metrics the health_trend widget can chart (the `metric` setting options).
export const TREND_METRICS = {
  steps: { label: 'feature_steps', chart_type: 'bar' },
  resting_heart_rate: { label: 'feature_resting_heart_rate', chart_type: 'line' },
  body_battery: { label: 'feature_body_battery', chart_type: 'line' },
  stress_average: { label: 'feature_stress_average', chart_type: 'line' },
  sleep_hours: { label: 'feature_sleep_duration', chart_type: 'bar' },
  sleep_score: { label: 'feature_sleep_score', chart_type: 'line' },
  hrv: { label: 'feature_hrv', chart_type: 'line' },
  weight_kg: { label: 'feature_weight', chart_type: 'line' },
};
export const TREND_PERIODS = ['last-week', 'last-month', 'last-three-months', 'last-year'];
export const ACTIVITY_COUNTS = ['3', '5', '8'];

const CONNECTION_COLORS = {
  [STATUS.CONNECTED]: WIDGET_COLORS.SUCCESS,
  [STATUS.MFA_REQUIRED]: WIDGET_COLORS.WARNING,
  [STATUS.BLOCKED]: WIDGET_COLORS.WARNING,
};

function notConnected() {
  return {
    ttl_seconds: 60,
    components: [{ type: 'text', variant: 'body', text: msg('widget_not_connected') }],
  };
}

function formatDateTime(timestamp, timeZone) {
  return perLanguage((language) =>
    new Intl.DateTimeFormat(language, {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp)),
  );
}

function formatNumber(value, maximumFractionDigits = 0) {
  return perLanguage((language) =>
    new Intl.NumberFormat(language, { maximumFractionDigits }).format(value),
  );
}

function formatDuration(minutes) {
  const total = Math.round(minutes ?? 0);
  const hours = Math.floor(total / 60);
  return hours > 0 ? `${hours} h ${String(total % 60).padStart(2, '0')}` : `${total} min`;
}

function truncate(value, max) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

const liveTile = (snapshot, gladys, metric, label, icon) => ({
  type: 'value',
  label: msg(label),
  icon,
  device_feature: accountFeatureId(gladys, snapshot, metric),
});

function dailySummary(app) {
  const { gladys, service, config } = app;
  const { snapshot } = service;
  if (!snapshot) {
    return notConnected();
  }
  const { metrics } = snapshot;
  const [lastActivity] = snapshot.activities;
  const hasStepGoal = metrics.steps !== null && metrics.step_goal > 0;
  return {
    // The tiles are live; the status rows change with each synchronization,
    // which nudges the widget (see refreshWidgets): the TTL is a safety net.
    ttl_seconds: 900,
    components: [
      liveTile(snapshot, gladys, 'steps', 'widget_steps', 'activity'),
      liveTile(snapshot, gladys, 'body_battery', 'widget_body_battery', 'battery-charging'),
      liveTile(snapshot, gladys, 'resting_heart_rate', 'widget_resting_hr', 'heart'),
      liveTile(snapshot, gladys, 'sleep_score', 'widget_sleep_score', 'moon'),
      liveTile(snapshot, gladys, 'stress_average', 'widget_stress', 'zap'),
      liveTile(snapshot, gladys, 'distance_km', 'widget_distance', 'map'),
      {
        type: 'status',
        items: [
          {
            label: msg('widget_account'),
            icon: 'user',
            value: truncate(snapshot.profile.full_name, 40),
            color: CONNECTION_COLORS[service.status] ?? WIDGET_COLORS.DANGER,
          },
          ...(hasStepGoal
            ? [
                {
                  label: msg('widget_step_goal'),
                  icon: 'flag',
                  value: `${Math.min(999, Math.round((metrics.steps / metrics.step_goal) * 100))} %`,
                  color:
                    metrics.steps >= metrics.step_goal
                      ? WIDGET_COLORS.SUCCESS
                      : WIDGET_COLORS.NEUTRAL,
                },
              ]
            : []),
          {
            label: msg('widget_last_sync'),
            icon: 'refresh-cw',
            value: formatDateTime(snapshot.synced_at, config.timezone),
            color: WIDGET_COLORS.NEUTRAL,
          },
          {
            label: msg('widget_last_activity'),
            icon: 'award',
            value: lastActivity ? truncate(lastActivity.name, 40) : msg('widget_none'),
            color: WIDGET_COLORS.INFO,
          },
        ],
      },
      {
        type: 'button',
        label: msg('widget_sync_now'),
        icon: 'refresh-cw',
        style: 'secondary',
        action: { key: DAILY_SUMMARY_ACTIONS.SYNC },
      },
    ],
  };
}

function activityItem(activity, domain) {
  const distance =
    activity.distance_km !== null && activity.distance_km > 0
      ? formatNumber(activity.distance_km, 2)
      : null;
  const unknown = '-';
  const details = perLanguage((language) =>
    msg('widget_activity_details')
      [language].replace('{duration}', formatDuration(activity.duration_minutes))
      .replace('{distance}', distance ? `${distance[language]} km` : unknown)
      .replace('{calories}', activity.calories ?? unknown)
      .replace('{hr}', activity.average_hr ? `${activity.average_hr} bpm` : unknown),
  );
  return {
    title: truncate(activity.name, 60),
    subtitle: msg(`activity_${activity.type}`),
    ...(activity.start_time ? { date: activity.start_time } : {}),
    badge: {
      text: distance
        ? perLanguage((language) => truncate(`${distance[language]} km`, 16))
        : formatDuration(activity.duration_minutes),
      color: WIDGET_COLORS.PRIMARY,
    },
    description: details,
    links: [
      {
        url: `https://connect.${domain}/modern/activity/${encodeURIComponent(activity.id)}`,
        label: msg('widget_open_garmin'),
      },
    ],
  };
}

function recentActivities(app, settings) {
  const { snapshot } = app.service;
  if (!snapshot) {
    return notConnected();
  }
  const count = Number(ACTIVITY_COUNTS.includes(settings?.count) ? settings.count : 5);
  const activities = snapshot.activities.slice(0, count);
  if (activities.length === 0) {
    return {
      ttl_seconds: 900,
      components: [{ type: 'text', variant: 'body', text: msg('widget_no_activity') }],
    };
  }
  return {
    ttl_seconds: 900,
    components: [
      {
        type: 'card-list',
        display: 'list',
        items: activities.map((activity) => activityItem(activity, app.config.domain)),
      },
    ],
  };
}

function healthTrend(app, settings) {
  const { snapshot } = app.service;
  if (!snapshot) {
    return notConnected();
  }
  const metric = TREND_METRICS[settings?.metric] ? settings.metric : 'steps';
  const interval = TREND_PERIODS.includes(settings?.period) ? settings.period : 'last-month';
  return {
    // The chart follows the published history by itself: nothing to refresh.
    ttl_seconds: 3600,
    components: [
      {
        type: 'chart',
        title: msg(TREND_METRICS[metric].label),
        chart_type: TREND_METRICS[metric].chart_type,
        device_features: [accountFeatureId(app.gladys, snapshot, metric)],
        interval,
      },
    ],
  };
}

export const WIDGETS = {
  [WIDGET_KEYS.DAILY_SUMMARY]: {
    async get(app) {
      return dailySummary(app);
    },
    async action(app, { actionKey }) {
      logger.info(`onWidgetAction <- ${WIDGET_KEYS.DAILY_SUMMARY}.${actionKey}`);
      if (actionKey !== DAILY_SUMMARY_ACTIONS.SYNC) {
        throw new Error(`Unknown widget action: ${actionKey}`);
      }
      await app.synchronize('widget');
      return msg('widget_sync_done');
    },
  },
  [WIDGET_KEYS.RECENT_ACTIVITIES]: {
    async get(app, { settings }) {
      return recentActivities(app, settings);
    },
  },
  [WIDGET_KEYS.HEALTH_TREND]: {
    async get(app, { settings }) {
      return healthTrend(app, settings);
    },
  },
};

/**
 * Ask the core to re-pull every widget now (after a synchronization or a
 * configuration change) instead of waiting for the content TTL. Fire and
 * forget: rate-limited core-side, dropped while disconnected.
 */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}

# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Garmin Connect sign-in with your email and password, two-step verification
  (MFA) included, through the "Sign in" action. The session is kept in the
  integration volume and refreshed without the password.
- A "Garmin Connect" device per account with the values of the day: steps,
  step goal, distance, active calories, floors, intensity minutes, resting
  heart rate, average stress, Body Battery, SpO2, respiration, sleep duration
  and score, HRV, training readiness, weight, body fat and BMI.
- A device per Garmin product registered on the account (watches, bike
  computers, Index scales...): last synced device and time since its last
  sync.
- Scene triggers: activity completed (filter by activity type), daily step
  goal reached, Body Battery low, night of sleep recorded, new weigh-in,
  Garmin device synced.
- Scene actions: synchronize now, get the daily summary, get the last
  activity.
- Dashboard widgets: daily summary (live tiles), recent activities, health
  trend chart.
- Configuration actions: sign in, test the connection, synchronize now, sign
  out.
- English, French, German and Spanish texts and documentation.

[Unreleased]: https://github.com/gboulvin/Gladys-GarminConnect/commits/main

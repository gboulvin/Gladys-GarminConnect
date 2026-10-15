# Garmin Connect for Gladys Assistant

An **external integration** for [Gladys Assistant](https://gladysassistant.com)
(5.1 or later) that brings your **Garmin Connect** account into your home
automation: Garmin watches, bike computers and Index scales, the health values
of the day, your activities, scene triggers and actions, and dashboard widgets.

Built from the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
with [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md)

## Features

| Surface                | What you get                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account device         | Steps, step goal, distance, active calories, floors, intensity minutes, resting heart rate, average stress, Body Battery, SpO2, respiration, sleep duration & score, HRV, training readiness, weight, body fat, BMI |
| One device per product | Every watch / bike computer / scale of the account: last synced device, time since its last sync                                                                                                                    |
| Scene triggers         | Activity completed (filter by type), daily step goal reached, Body Battery low, night of sleep recorded, new weigh-in, Garmin device synced                                                                         |
| Scene actions          | Synchronize now, get the daily summary, get the last activity (values as scene variables)                                                                                                                           |
| Dashboard widgets      | Daily summary (live tiles + Sync button), recent activities, health trend chart                                                                                                                                     |
| Configuration actions  | Sign in (two-step verification included), test the connection, synchronize now, sign out                                                                                                                            |
| Languages              | English, French, German, Spanish                                                                                                                                                                                    |
| Transport              | `cloud` (Garmin Connect)                                                                                                                                                                                            |

## How it talks to Garmin

Garmin has no public API for individuals (the Garmin Health API is reserved to
business partners). Like the community clients
([python-garminconnect](https://github.com/cyberjunky/python-garminconnect),
Home Assistant...), the integration signs in the way the Garmin Connect mobile
app does:

1. the email and password go to Garmin's SSO login API (`sso.garmin.com`),
   which answers a service ticket — or asks for the two-step verification code,
   sent back on the same SSO session;
2. the ticket is exchanged for OAuth2 tokens (`diauth.garmin.com`), refreshed
   without the password from then on and stored in the integration volume
   (`/data`, owner-only);
3. the integration reads `connectapi.garmin.com` at the configured interval
   (15 minutes by default, 5 minutes minimum). It never writes to the account.

Garmin can change this flow without notice; the code isolates it in
[`src/garmin/auth.js`](src/garmin/auth.js).

## Project structure

```
.
├─ index.js                      # bootstrap: SDK client + app + graceful shutdown
├─ src/
│  ├─ app.js                     # handlers, sync timer, publication to Gladys
│  ├─ garmin/                    # Garmin Connect client (auth, API, session, storage)
│  ├─ devices/                   # account device + one device per Garmin product
│  ├─ metrics.js                 # raw Garmin JSON -> values
│  ├─ events.js                  # scene triggers (diff of two snapshots)
│  ├─ scenes.js                  # scene actions
│  ├─ widgets.js                 # dashboard widgets
│  ├─ i18n.js                    # every user-facing text, en/fr/de/es
│  └─ config.js                  # defaults + normalization of the configuration
├─ docs/{en,fr,de,es}.md         # user documentation (re-hosted by Gladys)
├─ test/                         # node --test, fake Gladys (SDK) + fake Garmin
├─ gladys-assistant-integration.json
├─ Dockerfile                    # Node 24 Alpine, non-root, read-only rootfs ready
├─ CHANGELOG.md · SECURITY.md · CLAUDE.md
└─ .github/                      # CI, multi-arch build, release, Dependabot
```

## Development

```bash
npm install
npm test               # unit + end-to-end tests, no network
npm run lint
npm run format:check
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run it against a Gladys instance (developer mode):

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="garmin-connect" \
GARMIN_DATA_DIR=./data \
LOG_LEVEL=debug \
npm start
```

## Release

1. Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
2. **Actions → Release → Run workflow** (`patch`, `minor` or `major`): it bumps
   `package.json` and the manifest, rolls the changelog, tags `vX.Y.Z`, builds
   the `linux/amd64` + `linux/arm64` image to
   `ghcr.io/gboulvin/gladys-garminconnect` and publishes the GitHub Release.
3. The decentralized indexer of the Gladys store picks up the new version (the
   repository carries the `gladys-assistant-integration` topic, and the GHCR
   package must be public).

## License

Apache-2.0. Garmin, Garmin Connect, Body Battery, Forerunner, Edge and Index
are trademarks of Garmin Ltd. or its subsidiaries; this project is not
affiliated with Garmin.

# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

**Garmin Connect**, a Gladys Assistant **external integration**: a Node.js
service (Node 22+, ESM, no build step) running in its own sandboxed Docker
container, talking to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
(its only runtime dependency) and to Garmin Connect over HTTPS with the global
`fetch`. It started from the official JavaScript template
(`GladysAssistant/integration-template-js`).

Garmin has no public API for individuals: the integration signs in like the
Garmin Connect mobile app (the flow `cyberjunky/python-garminconnect` follows:
SSO login API → CAS service ticket → "DI" OAuth2 tokens on `diauth.garmin.com`)
and only READS the account. When Garmin changes that flow, compare with that
library first.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
node --test --test-name-pattern "MFA"     # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing.

## Architecture

```
index.js                     bootstrap: SDK client + createApp + shutdown
src/app.js                   wiring: handlers, sync timer, publication of devices/states/events
src/garmin/auth.js           sign-in (mobile, then portal flow), MFA, DI token exchange/refresh
src/garmin/api.js            connectapi client: token refresh, endpoints (read-only)
src/garmin/service.js        session lifecycle + one snapshot per sync + statuses
src/garmin/tokenStore.js     session tokens in /data (0600, bound to email + domain)
src/garmin/http.js           fetch helpers, cookie jar of the SSO conversation
src/metrics.js               raw Garmin JSON -> values (pure, defensive)
src/events.js                scene triggers: diff of two snapshots (pure)
src/devices/                 account device (health values) + one device per Garmin product
src/scenes.js                scene action handlers (manifest `scene_actions`)
src/widgets.js               dashboard widgets (manifest `widgets`)
src/i18n.js                  every user-facing text, en/fr/de/es
src/config.js                DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
docs/{en,fr,de,es}.md        user documentation, re-hosted by Gladys (en + fr mandatory)
test/helpers/fakeGarmin.js   in-memory Garmin (SSO, token host, API) for the tests
```

## Rules

- **External ids are forever.** The account device is keyed by the Garmin
  profile id, a product device by its Garmin device id, a feature by its key
  in `ACCOUNT_FEATURES` / `DEVICE_FEATURES`. Never rename one: Gladys keys the
  history, scenes and dashboards on them. Same for every manifest key
  (`config_schema`, actions, scene triggers/actions, widgets, their fields and
  outputs).
- **Never write to the Garmin account.** Read-only endpoints only.
- **Secrets.** The password only goes to the Garmin SSO; tokens only to
  `/data/garmin-session.json`. Never log the password, tokens, the CAS ticket
  or response bodies of the auth hosts. Only official Garmin domains
  (`ALLOWED_DOMAINS`).
- **Be gentle with Garmin.** Sync interval 5 minutes minimum, one sync at a
  time, never re-send the password automatically after a refusal or while an
  MFA code is awaited (each attempt may e-mail the user a new code).
- **The container rootfs is read-only.** Write only under `/data`.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand — except on the hand-pushed tag path of the README, which bumps all
  three together. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow moves the section.
- **Four languages.** Every user-facing text exists in English, French, German
  and Spanish: manifest texts (`label`, `description`, `placeholder`, option
  labels), `src/i18n.js`, and `docs/*.md`, kept in sync. The tests check the
  manifest and `src/i18n.js`. Widget texts respect the core limits (tile label
  ≤ 24, status ≤ 40, button ≤ 24, link label ≤ 24): `validateWidgetContent`
  in `test/widgets.test.js` must stay `[]`.
- **Manifest.** The catalog `description` holds 10 to 100 characters per
  language; scene/widget fields need `gladys_version >= 5.1.0`.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (`fakeGarmin` + the SDK's fake
  Gladys).

# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainer for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove emails, tokens, passwords and addresses
  first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## What the integration does with your Garmin account

- The Garmin Connect **email and password** are stored by Gladys as
  integration configuration (the password is a `secret` field, never shown
  back in the interface). The password is only sent to Garmin's own sign-in
  service (`sso.garmin.com` / `sso.garmin.cn`), over HTTPS, when a new session
  is needed.
- The session tokens Garmin issues are stored in the integration's private
  volume (`/data/garmin-session.json`, readable by the integration user only).
  The **Sign out** action deletes them.
- The integration only **reads** your data: it never writes to your Garmin
  account. It only talks to official Garmin hosts (`garmin.com` /
  `garmin.cn`).
- Nothing is sent anywhere else, and the logs never contain the password nor
  the tokens.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Garmin's services and devices.

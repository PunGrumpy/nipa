# Session and profiles

A user checks who they are logged in as, which profiles and projects they have, which `OS_*` variables nipa would hand to OpenStack tools, and whether their setup works at all.

## Sub-features

- `whoami` prints the logged-in user, and its JSON names the profile, project and expiry.
- `profile-ls` lists profiles with their Keystone host, region and login.
- `project-ls` lists the projects the account can use, without disabled ones.
- `env` prints `export OS_*=` lines for the session.
- `doctor` checks config, profile, Keystone, the Space API, the session, the token, the folder link, tools and updates.

## How to get to it (user POV)

- Run `nipa whoami` or `nipa whoami --json`.
- Run `nipa profile ls` or `nipa profile ls --json`.
- Run `nipa project ls`.
- Run `nipa env`.
- Run `nipa doctor` or `nipa doctor --json`.

## Driving it with control-nipa

Preconditions:

- The baseline in the README holds.
- The run's only profile is `prod`, pointing at the run's localhost URL, logged in as `me@example.com` to `Alpha`.

- **Who am I.** Run `$C run --run "$RUN" -- whoami`. Exit `0`, and stdout is `me@example.com`.
- **Who am I as JSON.** Run `$C run --run "$RUN" -- whoami --json`. Exit `0`, and the JSON has `"loggedIn": true`, `"profile": "prod"` and `project.name` `Alpha`.
- **Profiles.** Run `$C run --run "$RUN" -- profile ls`. Exit `0`, and the table's one row is `prod` with `localhost:<port>`, `NCP-TH` and `me@example.com (Alpha)`.
- **Projects.** Run `$C run --run "$RUN" -- project ls`. Exit `0`, and stdout lists `Alpha` and `Beta` with their IDs and not the disabled `Gone`.
- **Environment.** Run `$C run --run "$RUN" -- env`. Exit `0`, and stdout has `export OS_AUTH_URL='http://localhost:<port>'`, `OS_PROJECT_NAME='Alpha'` and `OS_TOKEN='<redacted-token>'`.
- **Doctor.** Run `$C run --run "$RUN" -- doctor`. Exit `0`, and every line starts with `✔` and the last reads `9 passed`.

## Gotchas

- `nipa doctor`'s Tools check looks up `openstack` and `terraform` on your `PATH`, so it passes or fails with your machine, not with the change. It only looks them up and never runs them.
- `nipa doctor`'s Update check reads the cache in the run's home. It makes no request.
- The token in `env` output is the fake's, and the helper still redacts it. Never paste an unredacted `OS_TOKEN` from anywhere else into a PR.
- `profile add`, `switch`, `link` and `logout` change the run's config. Run them only on a fresh run, and `down` it after.

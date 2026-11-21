# nipa verification map

This directory is the maintained source for verifying what a nipa user sees. Read this index first, then use the matching feature file as the recipe. Every recipe runs through `control-nipa.ts` against the fake cloud on localhost.

## Baseline preconditions

- Run from the repository root with `C=packages/cli/.agents/skills/verify-nipa/scripts/control-nipa.ts`.
- `bun install` has run in this checkout.
- `$C up --run "$RUN"` printed `ready`, and `$C doctor --run "$RUN"` printed only `ok` lines.
- The run is fresh. The fake keeps server state for the life of its process, so a recipe that starts or stops a server needs a new `down` and `up` first.
- Never drive a run that another agent started.

## Driving conventions

- Run every nipa command as `$C run --run "$RUN" -- <args>`. Keep the quoted names and flags literal.
- stdin is closed, so nipa behaves as it does in CI and never prompts.
- Use `--json` and parse stdout for assertions on data. Use the human output for assertions on wording.
- Human output puts the IDs, or the table as TSV when piped, on stdout. Headings, notes and timings go to stderr.

## Proof and skip reporting

- CLI proof is the evidence file `run` names, with the command, stdout, stderr and exit code.
- A change to stored state needs a second read-only command that shows it.
- Record the feature file and sub-feature ID with each evidence file.
- Report a refused or unreachable path with the attempted command and the reason. Don't count it as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with control-nipa` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

## Features

- [Help, version and typos](./help-and-version.md) covers `--version`, the main and per-command help, and the suggestions for unknown commands.
- [Session and profiles](./session-and-profiles.md) covers `whoami`, `profile ls`, `project ls`, `env` and `doctor`.
- [Servers](./servers.md) covers `server ls`, `search`, `inspect`, `history`, `logs`, `start` and `stop`.
- [Investigate and other resources](./investigate-and-resources.md) covers `investigate` and the read-only lists such as `volume ls`.

## Not verified here

These paths have no offline route through this skill. Each one is marked `needs live API: not verified` or names the test that covers it instead.

- `nipa login` with a real password and OTP code against Nipa Cloud: needs live API: not verified. The fake's login is covered by `test/integration.test.ts`. This helper closes stdin, so it can't type a password.
- `nipa login --remember` with the macOS Keychain or the Linux secret service: needs a real keychain and live API: not verified. The helper puts the fake keychain on `PATH`.
- `nipa os`, `nipa tf`, `nipa exec` and `nipa open`: refused by the helper because they start openstack, terraform, a shell or a browser.
- `nipa mcp`: a stdio server that needs stdin. It is covered by `test/integration-mcp.test.ts`, not by this helper.
- Every command against Nipa Cloud's real Keystone, Space API or gateway: needs live API: not verified. The fake answers like them as far as the tests encode, no further.

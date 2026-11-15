---
name: verify-nipa
description: Drive the nipa CLI from source against the test suite's fake Keystone and Space API on localhost, and capture the command, stdout, stderr and exit code as proof. Use to verify or review a packages/cli change the way a user runs it, such as a new command, flag, table, JSON field, error or hint, without a Nipa Cloud account. Never reaches a real cloud.
---

# Verify nipa

nipa is a CLI. A user types `nipa <command>` and reads stdout, stderr and the exit code. This skill runs that same path, `bun packages/cli/src/index.ts`, through one helper, `control-nipa.ts`. The helper gives each run a fake Keystone and Space API on a free localhost port, a throwaway `HOME` and config directory, a fake keychain and a logged-in session. It then records every command it runs.

Run every command from the repository root. The helper path is long, so set it once:

```sh
C=packages/cli/.agents/skills/verify-nipa/scripts/control-nipa.ts
```

## Safety contract

This skill never reaches Nipa Cloud, and it doesn't touch your keychain or your real config. The helper enforces that, so keep every nipa command inside `$C run`.

- **Clean environment.** nipa gets only `HOME`, `NIPA_CONFIG_DIR`, `XDG_*`, `PATH`, `TMPDIR`, `NO_COLOR=1` and `NIPA_NO_UPDATE_CHECK=1`. No `OS_*` variable or `NIPA_PROFILE` from your shell leaks in.
- **Localhost only.** `run` refuses when any profile in the run's `config.json` names a host other than localhost. It also refuses when an argument contains such a URL.
- **No outside programs.** `run` refuses `nipa os`, `tf`, `exec` and `open`, even with `--help`. They hand their arguments to openstack, terraform, a shell or a browser.
- **Fake keychain.** `security` and `secret-tool` on the run's `PATH` are the fakes from `test/mocks/keychain.ts`. They write to `$HOME/fake-keychain.json` inside the run.
- **Redaction.** The session token appears as `<redacted-token>` in output and evidence.
- **Stdin closed.** nipa can't prompt, as in CI. A command that needs a password or OTP code fails with its non-interactive hint.

Never run `bun packages/cli/src/index.ts` or an installed `nipa` outside the helper for verification. Without `NIPA_CONFIG_DIR`, nipa reads your real profiles. With an empty one, its default profile is production.

## Launch

```sh
bun install                 # once per checkout
$C up --run "$RUN"          # RUN is any name of letters, digits, - and _; default "default"
```

Ready looks like this:

```text
ready <run> http://localhost:<port>
home <tmp>/nipa-verify/runs/<run>/home
evidence <tmp>/nipa-verify/evidence/<run>
```

`up` waits for the fake to write its URL. It then gets a real token from the fake with the test user's password and OTP code (fixtures from `test/mocks/keystone.ts`), so ready means a logged-in session. `up` on a live run reports it and changes nothing. Runs with different names are independent, each with its own port, home and evidence. Two agents must never share one run name.

The fake serves user `me@example.com` with projects `Alpha` (the current one, which owns every resource) and `Beta`. Alpha has servers `web-1`, `web-2`, `db-1`, `k8s-control-plane-1`, `k8s-worker-1` and `legacy-node-1`, plus volumes, networks, security groups, IPs, load balancers, Kubernetes clusters and databases. `test/mocks/space.ts` has them all.

## Doctor

Run this first, and again whenever anything looks off. It only reads.

```sh
$C doctor --run "$RUN"
```

Each line reads `ok` or `FAIL`. The checks are the state file, the fake cloud's pid, a localhost URL, an answer from the fake, every profile on localhost, `security` resolving to the fake, and `nipa --version` from source matching `packages/cli/package.json`. Exit code 0 means every check passed.

## Drive

```sh
$C run --run "$RUN" -- <nipa args>
```

Examples: `$C run -- server ls`, `$C run -- server inspect web-1 --json`, `$C run -- -P prod project ls`. stdout and stderr pass through unchanged and the helper exits with nipa's code. Its last stderr line names the evidence file. A refusal prints `control-nipa: refused: <why>` and exits 1 without running nipa.

To test a change, drive the commands the change touches from the matching file in [`features/`](features/README.md). Then drive a neighbor it shouldn't touch.

## Evidence

Each `run` writes `<evidence>/<NN>-<args>.txt` with the command line, exit code, stdout and stderr. It also appends a row to `<evidence>/index.tsv` with the time, exit code, file and command. Evidence lives outside the run's home, so `down` keeps it.

Proof standards:

- Show the action and the resulting state. After `server start legacy-node-1`, also run `server inspect legacy-node-1 --json` and read its status.
- For JSON, parse stdout (`jq` or `bun -e`) and assert the field. Don't grep pretty output.
- For an error, prove the exit code, the message on stderr, an empty stdout, and the hint.
- A check passes on what nipa printed for the user path, never on a unit test or an internal function.

## Cleanup

```sh
$C down --run "$RUN"
```

`down` stops only the fake cloud pid recorded in the run's state and deletes the run's home. It keeps `<tmp>/nipa-verify/evidence/<run>/`, and its output names that folder. Run `down` after every failed attempt too. Delete evidence by hand once it's in the PR. `NIPA_VERIFY_ROOT` moves both folders from `$TMPDIR/nipa-verify`.

## Helpers

- `scripts/control-nipa.ts` runs `up`, `doctor`, `run` and `down`, as shown above. It imports `seedSession` from `test/helpers.ts` and `installFakeKeychain` from `test/mocks/keychain.ts`, so it follows the test suite's fixtures.
- `scripts/fake-cloud.ts <url-file>` is the server that `up` starts in the background, with its log at `runs/<run>/fake-cloud.log`. Don't start it by hand.

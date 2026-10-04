# CLI UX verification

These gates cover testing, stale-string sweeps and review for any change to nipa's output or flow.

## Where tests go

Pick the test by what it needs:

- **`test/integration.test.ts`**: runs `bun src/index.ts` as a process against the fake Keystone, with stdin closed and `NO_COLOR=1`. Use it for exit codes, the stdout and stderr split, files on disk, and the path without a terminal
- **`test/integration-npm.test.ts`**: builds the Node bundle and runs it with `node`. Extend it when a change could behave differently on Node than on Bun
- **`test/unit/commands/<name>/`**: pure helpers inside one command folder, such as `server/format.ts`
- **`test/unit/util/`**: shared modules in `src/util`, such as `dispatch.test.ts` for routing and help, and `session.test.ts` for the login flow with fake prompts
- **`test/unit/commands/index.test.ts`**: the command table. It fails when a folder is missing from `src/commands/index.ts`, when names or flags clash, or when a folder imports another folder or calls `console.*`

Shared fixtures:

- `test/mocks/keystone.ts` starts a fake Keystone with the compute API. Add routes there for a new API
- `test/helpers.ts` has `runProcess`, `testEnv`, `seedSession` and `ENTRY`. `testEnv` points `HOME` and `NIPA_CONFIG_DIR` at a temporary directory, so tests never touch your real config

## What to cover

When a change touches output or flow, cover each item that applies:

- The new output, and an assertion that the removed string is gone
- The path with a terminal and the path without one. `runProcess` closes stdin, so it always tests the second
- `--json`: parse stdout with `JSON.parse` and assert fields, and assert stdout has nothing else
- A pipe: assert that stdout holds only the bare values, one per line
- The stdout and stderr split: messages on stderr, data on stdout
- The exit code for success, failure, a wrong command line, and Ctrl-C or a declined confirmation where the command prompts
- An empty list: the human line on stderr, `[]` in `--json`, and exit code 0
- `--debug`: request lines on stderr, and no token, password or OTP code anywhere
- Files: their contents, and mode `0600` for anything new in the config directory
- The help page and completion, when a command, flag or argument changes

Run focused tests first, then the full set from the repository root:

```bash
cd packages/cli
bun test test/integration.test.ts -t "server ls"
cd ../..
bun run check
bun run typecheck
bun run test
```

## Stale-string sweeps

Search the source and tests for strings the copy rules ban:

```bash
rg -n "\b(successfully|Unable to|Oops|Whoops|An error occurred|Something went wrong)\b" packages/cli/src
rg -n "Do you want to|Would you like to|\.\.\.\"|\bjust\b|\bsimply\b|\bplease\b" packages/cli/src
rg -n "console\.(log|error|warn)" packages/cli/src/commands
```

When you rename a message, search for the old string in both `src` and `test`. Tests may keep an old string only inside a negative assertion.

## Review checklist

Reject or fix a change that:

- prompts for a value an argument, flag, or the saved profile already supplies
- prompts without checking `client.prompts.interactive`, or fails without a terminal and no hint naming the flag
- prints anything but data to stdout, or prints data only to stderr
- adds color, a spinner or a note to `--json` output
- prints more than one `success` line for one change, or a `success` line before the change is saved
- writes local files before the remote call they depend on succeeds
- throws a plain `Error` for a case the person can fix, instead of a `CliError` with a hint
- gives an error without the exact command or flag that fixes it, when one exists
- exits 1 for a wrong command line instead of using `usageError`
- prints a token, password or OTP code outside `nipa env`
- writes a file in the config directory without mode `0600`
- changes a compatibility contract from `core.md` without a migration, tests, and a changeset when users see it
- changes a shared helper in `src/util/ui.ts` or `src/util/session.ts` without testing a second command that uses it
- changes copy without a test that asserts it
- reviews only the edited line instead of every string the command prints

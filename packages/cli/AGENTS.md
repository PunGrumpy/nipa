# nipa CLI agent guide

This guide loads for every task inside `packages/cli`, so it stays short. The rules for what nipa prints and asks live in the `cli-ux` skill at `packages/cli/.agents/skills/cli-ux/`. Load that skill only when the task or review touches what a person or script sees.

## First steps

Before you change behavior:

1. Read the command's source and its tests
2. Decide whether the change touches only the implementation, or also help, prompts, output, errors, JSON, exit codes or the path without a terminal
3. For the second kind, load `packages/cli/.agents/skills/cli-ux/SKILL.md` and the references it names
4. Reuse the helpers in `src/util/` and the patterns of the nearest command before adding new ones
5. Keep command names, flags, exit codes, environment variables, config files, JSON fields and piped stdout compatible, unless the change migrates them on purpose, with tests

## Task routing

Send each kind of task to its source:

- **Output, copy, prompts, help, errors, JSON or the non-interactive path**: load the `cli-ux` skill
- **A review of those surfaces**: load the `cli-ux` skill before you judge the diff, even when the review makes no edits
- **A new command**: follow `docs/add-a-command.md`
- **A new or changed flag or argument**: change the spec in `src/commands/<name>/command.ts`. Parsing, help and completion all read it
- **A new Space API call**: add a module in `src/util/`, written like `src/util/compute.ts`, and its routes in `test/mocks/keystone.ts`
- **A new durable UX rule**: update the `cli-ux` skill, not this file

## Code map

Each command has a folder:

```text
src/commands/<name>/
  command.ts      the spec: name, aliases, flags, arguments, subcommands, examples
  index.ts        binds the spec to code with handle, route or forward
  <action>.ts     one handler per subcommand, such as ls.ts

src/commands/index.ts   the command table and the sections of the main help

test/unit/commands/<name>/
  *.test.ts
```

Shared modules in `src/util/`:

- `command.ts`, `spec.ts`, `parse.ts`, `dispatch.ts`, `help.ts` and `completion.ts`: the command framework. Command folders don't import `client.ts`, `dispatch.ts`, `help.ts` or `parse.ts`, and `test/unit/commands/index.test.ts` fails when they do
- `arg-common.ts`: shared flags such as `--json` and `--yes`, and the global options
- `client.ts`: what a handler gets, which is the result stream, the prompts, and the profile, session and cloud for this run
- `ui.ts`: messages, spinners, tables, prompts and `CliError`
- `session.ts`, `keystone.ts` and `store.ts`: login, tokens and the files in the config directory
- `http.ts`, `api.ts`, `compute.ts` and `openstack.ts`: requests to Keystone, the Space API and the OpenStack client
- `env.ts` and `tool.ts`: the `OS_*` variables and the programs that `os`, `tf` and `exec` run

## Implementation rules

Follow these in every command:

- Declare the command with `defineCommand`, `defineGroup` or `definePassthrough` in `command.ts`, and bind it with `handle`, `route` or `forward` in `index.ts`
- Name flags in lowercase kebab-case. Copy shared flags from `src/util/arg-common.ts`
- A handler returns its exit code. Throw a `CliError` with a hint to fail, or `usageError` when the command line was wrong
- Write results through `client.stdout` and messages through the helpers in `src/util/ui.ts`. Never call `console.*` in a command folder
- Get the session through `client.session()` or `client.cloud()`, which log in first when nipa can prompt
- A command folder never imports another command's folder. Move shared code to `src/util/`
- Parse every API response with a zod schema
- Never log a token, password or OTP code, even with `--debug`

## Testing

Tests run on Bun:

- Process tests that run the CLI against the fake Keystone go in `test/integration.test.ts`
- Unit tests go under `test/unit/commands/<name>/` or `test/unit/util/`, mirroring `src`
- When output changes, assert the new string and that the old one is gone
- When JSON changes, parse stdout and assert its fields
- When a command prompts, test the path without a terminal. `runProcess` in `test/helpers.ts` closes stdin

Run one file while you work:

```bash
cd packages/cli
bun test test/unit/util/session.test.ts
```

Run what continuous integration (CI) runs, from the repository root:

```bash
bun run check
bun run typecheck
bun run test
bun run --cwd packages/cli check:package
```

## Local CLI

Run the CLI from source without installing it:

```bash
cd packages/cli
bun run dev server ls
```

Point `NIPA_CONFIG_DIR` at a temporary directory to keep your real profiles and sessions out of the way.

## Guardrails

The full review checklist lives in `packages/cli/.agents/skills/cli-ux/references/verification.md`. These rules always apply:

- Don't prompt when `client.prompts.interactive` is false. Fail with a hint that names the flag instead
- Don't put messages, colors or spinners on stdout when it carries `--json` or piped data
- Don't print secrets in output, JSON, debug lines, hints or suggested commands
- Save local files only after the remote call they depend on succeeds
- A pull request that changes what users see needs a changeset from `bun changeset`. Label any other pull request `semver: none` instead

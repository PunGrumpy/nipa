---
name: cli-ux
description: Use for packages/cli changes that affect what a person or script sees from nipa, such as help, prompts, progress, success, notes, errors, tables, JSON, stdout and stderr, exit codes, or the non-interactive path, and for tests of those surfaces. Don't load it for refactors that leave the CLI's surface unchanged.
---

# nipa CLI UX

This skill keeps nipa's output consistent, scriptable and safe to run without a terminal. It covers the flow of a command, its wording, where each line goes, and how to test it.

## Stance

Work like a CLI product engineer, not a string polisher:

- Read the command's source and tests before you judge its output
- Fix the flow when the flow is wrong, because better wording can't repair a prompt that comes too early or a result that never prints
- Keep human output readable and machine output stable
- Treat scripts, CI and coding agents as users: a command that needs a terminal fails with the flag to pass instead
- Keep compatibility unless the change migrates it on purpose, with tests
- Reuse the helpers in `src/util/ui.ts` and the patterns of the nearest command before adding new ones

## Decision order

When two sources disagree, the higher one wins:

1. The user's explicit goal and constraints
2. How Keystone, the OpenStack APIs and nipa's files behave, and the compatibility contracts in [`references/core.md`](references/core.md#compatibility)
3. `packages/cli/AGENTS.md`, this skill, and tests that encode intended behavior
4. The contracts in [`references/command-contracts.md`](references/command-contracts.md)
5. The patterns of nearby commands
6. General CLI habits

Shipped output proves what exists, not that it's right.

## Workflow

Walk a change through these maps before you write strings:

1. **Surface map**: list the help, flags, prompts, spinners, notes, success lines, errors, tables and JSON the change touches
2. **Mode map**: trace a terminal, a pipe (`client.stdout.isTTY` is false), no terminal at all (`client.prompts.interactive` is false), `--json` and `NO_COLOR`
3. **State map**: name the profile, the session, the project and the files the command reads or writes
4. **Question audit**: for every prompt, prove nipa can't infer the value and that a flag or argument can supply it
5. **Mutation audit**: name each local write and each Keystone or API call that changes state, and what happens when it fails halfway
6. **Transcript review**: read the before and after output in a terminal and through a pipe
7. **Regression lock**: test the new path and assert that removed strings are gone

## References

Load only the reference the task needs:

| Task | Load |
| --- | --- |
| Any change to output or flow | [`references/core.md`](references/core.md) |
| New or changed copy, or a copy review | [`references/core.md`](references/core.md) and [`references/copy.md`](references/copy.md) |
| `login`, `switch`, sessions, or prompts | [`references/command-contracts.md`](references/command-contracts.md) |
| `os`, `tf`, `exec`, or `env` | [`references/command-contracts.md`](references/command-contracts.md) |
| `server start`, `stop` or `restart` | [`references/command-contracts.md`](references/command-contracts.md) |
| Tests, stale-string sweeps, or a review | [`references/verification.md`](references/verification.md) |

Put new durable rules where they belong: wording in `copy.md`, flow, streams and layout in `core.md`, one command's state machine in `command-contracts.md`, and test or review gates in `verification.md`. A new rule needs evidence from the current source, its scope, and the consequence it prevents. One shipped string isn't enough.

## Quality bar

Every changed command answers four questions:

- Which profile and project did nipa use?
- What will change?
- What happened?
- What can the person or script do next?

A change isn't done until:

- the before and after transcript is easier to scan
- every prompt has a flag or argument, and the path without a terminal fails with a hint naming it
- `--json` and piped stdout carry only data, with no color codes, spinners or notes
- errors say what failed and how to fix it, and exit with the right code
- the copy review covered every string the command prints, not only the edited line
- tests assert the new output and reject the old one
- `bun run check`, `bun run typecheck` and `bun run test` pass from the repository root

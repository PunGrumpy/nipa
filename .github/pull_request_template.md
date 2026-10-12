<!--
Title: a Conventional Commit without a scope and with a lowercase subject,
such as "fix: keep the session after nipa switch". CI checks the title.
Read .github/CONTRIBUTING.md first if this is your first pull request here.
-->

## What changed

<!-- What nipa or the site does now that it didn't before, from the user's side. -->

## Why

<!-- The problem this solves. Link the issue with "Closes #123" when there is one. -->

## How you checked it

<!--
The commands you ran and what you saw. For the site, add a screenshot.
Say what you couldn't check.
-->

## Checklist

- [ ] `bun run check`, `bun run typecheck` and `bun run test` pass
- [ ] The pull request has a changeset from `bun changeset`, or the `semver: none` label when users don't see the change
- [ ] The pages in `docs/` and the `--help` text match the change

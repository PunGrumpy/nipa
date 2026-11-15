<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

## Check and ship a change

This is a Bun monorepo. `packages/cli` is the `nipa` command and has its own `AGENTS.md`, `apps/web` is the site, and `docs/` holds the user docs. `plans/` is not tracked.

Run `bun run verify` from the repository root before you push. It runs the lint and format check, the type check, the package check for the CLI, the tests and the site build, in that order. CI runs the same checks, then also builds the compiled binary and the npm package and runs `--version` on both, which `verify` does not. The tests run against a fake Keystone, so they need no account. Format only the files you changed with `bunx ultracite fix <files>`, not `bun run fix`.

Give the pull request a Conventional Commit title with no scope and a lowercase subject, such as `fix: keep the session after nipa switch`. `.github/workflows/lint-pr-title.yml` checks that the type is one of the allowed ones and that the subject starts with a lowercase letter. It does not check the scope, so `fix(cli): x` passes, but the convention here is no scope.

Run `bun changeset` when users see the change. When they don't, as with tests, CI or docs, the pull request gets the `semver: none` label instead. Pull requests are squash merged.

Commits carry no co-author line and no tool or model attribution.

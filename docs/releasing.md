<!-- contentType: How-to · plan: docs/content-plan.md -->

# Release nipa

This page shows how a change becomes a release, from the changeset in a pull request to the binaries on GitHub. You don't run any release command by hand.

## Add a changeset to your pull request

Every pull request that changes what users see needs a changeset, and the continuous integration (CI) checks fail without one. Run this and answer the questions:

```sh
bun changeset
```

Pick `patch` for a fix, `minor` for a new command or option, or `major` for a change that breaks scripts. Then write one sentence about the change from the user's side, naming the command in backticks:

```md
---
"nipa-cli": minor
---

Add `nipa profile` to log in to more than one Keystone, such as staging.
```

A pull request that only changes tests, CI or docs can add an empty changeset with `bun changeset --empty`.

## Merge the version pull request

When changesets reach `main`, the Release workflow opens a pull request titled "chore: version packages", and updates it with each new changeset. Merging it does 4 things:

1. Bumps the version in `packages/cli/package.json` and adds the changesets to `packages/cli/CHANGELOG.md`
2. Publishes `nipa-cli` to npm as `packages/cli/dist/nipa.js`, a bundle for Node.js 22.13 or later. npm trusts the Release workflow through Trusted Publishing, so the repository stores no npm token
3. Tags the commit `v<version>`
4. Builds the binaries for macOS, Linux and Windows, and attaches them and a `SHA256SUMS` file to a GitHub release, with that version's `CHANGELOG.md` section as the notes

The Release workflow runs these steps as separate jobs with [Changesets' GitHub Action](https://github.com/changesets/action), and only the job that publishes to npm can request the token that Trusted Publishing checks. If the GitHub release fails after npm has the version, re-run the failed jobs of that workflow run, not the whole run: a new run sees the version on npm and skips the release.

Workflows don't run on the version pull request, because GitHub doesn't start workflows for pull requests that a workflow opens. The changes it releases already passed CI on `main`, and its own commit only edits `package.json` and `CHANGELOG.md`.

## Build the binaries and the npm package locally

To check a build before a release, run:

```sh
bun run build:release
bun run build:npm
```

The first command writes the binaries and `SHA256SUMS` to `packages/cli/dist/`. The second writes the npm bundle, `packages/cli/dist/nipa.js`, which `node packages/cli/dist/nipa.js --version` runs. `bun run build` builds only the binary for your machine, as `packages/cli/dist/nipa`.

To check the package that npm would publish, run this in `packages/cli`:

```sh
bun run check:package
```

It builds the npm bundle, then [publint](https://publint.dev) checks `package.json` against the files in the package. CI runs the same check on every pull request.

# Changesets

Every pull request that changes what users get needs a changeset. Run:

```sh
bun changeset
```

Pick `patch`, `minor` or `major`, then write one sentence about the change from the user's side, naming the command in backticks. For example:

```md
---
"nipa-cli": patch
---

`nipa switch` keeps the current project when the new one cannot be reached.
```

Pull requests that only touch tests, CI or docs can add an empty changeset with `bun changeset --empty`.

When changesets reach `main`, the Release workflow opens a "chore: version packages" pull request. Merging it bumps `package.json`, writes `CHANGELOG.md`, tags `v<version>` and publishes the binaries to a GitHub release.

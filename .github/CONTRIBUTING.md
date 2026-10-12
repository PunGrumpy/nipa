# Contribute to nipa

This page shows how to set up nipa, check a change and open a pull request.

## Before you start

Open an issue before a large change, such as a new command, so the direction is agreed before you write the code. A small fix needs no issue.

Problems with a Nipa Cloud account, project or bill go to [Nipa Cloud](https://nipa.cloud), not here.

## Set up

nipa is a TypeScript monorepo that runs on [Bun](https://bun.sh).

```sh
git clone https://github.com/PunGrumpy/nipa.git
cd nipa
bun install
```

| Folder         | What it holds                         |
| -------------- | ------------------------------------- |
| `packages/cli` | The `nipa` command-line tool          |
| `apps/web`     | The showcase site, built with Next.js |
| `docs`         | The guides and the CLI reference      |

The CLI's tests run against a fake Keystone, so you don't need a Nipa Cloud account. Run `bun run dev` to start the site at `http://localhost:3000`.

## Check your change

Run the checks that CI runs:

```sh
bun run check
bun run typecheck
bun run test
```

`bun run fix` formats the code and fixes the lint errors it can.

## Open a pull request

1. Give the pull request a [Conventional Commits](https://www.conventionalcommits.org) title without a scope and with a lowercase subject, such as `feat: list volumes with nipa volume ls`. CI checks the title.
2. Run `bun changeset` when users see the change. When they don't, as with tests, CI or docs, ask a maintainer for the `semver: none` label.
3. Update the pages in `docs/` and the `--help` text that the change affects.
4. Fill in the pull request template.

[Add a command to nipa](../docs/add-a-command.md) and [Release nipa](../docs/releasing.md) have the details.

## Deploy the site

The site is a static export that Cloudflare Workers serves. `apps/web/cloudflare.config.ts` configures the Worker.

```sh
cd apps/web
cf auth login
SITE_URL=https://example.com bun run deploy
```

Set `SITE_URL` to the address the site is served from, so shared links get the right image URL. `bun run deploy:preview` deploys the current branch as a preview.

## Report a security problem

Don't open a public issue for a vulnerability. Follow the [security policy](SECURITY.md).

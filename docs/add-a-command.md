<!-- contentType: How-to · plan: docs/content-plan.md -->

# Add a command to nipa

This page shows how to add a command with subcommands to nipa, using `nipa volume ls` as the example. You declare the command once, and nipa builds its parsing, help page, usage errors and tab completion from that declaration.

## Where a command lives

The CLI lives in `packages/cli`, and the paths on this page start there. Each command has a folder in `src/commands`, laid out like the Vercel CLI's:

- **`command.ts`**: the command as plain data, with its name, aliases, flags, arguments and subcommands
- **`index.ts`**: binds that data to code with `handle`, `route` or `forward`
- **One file per subcommand**: the handler, such as `ls.ts`

Copy `src/commands/server` for a command that lists OpenStack resources. Code that two commands share goes in `src/util`. `test/commands.test.ts` fails when a command imports another command's folder.

## 1. Declare the command

Copy `src/commands/server` to `src/commands/volume`. Then declare `volume` and its `ls` subcommand in `command.ts`:

```ts
import { jsonFlag } from "../../util/arg-common";
import { defineCommand, defineGroup } from "../../util/command";

export const lsSubcommand = defineCommand({
  aliases: ["list"],
  args: [],
  flags: [jsonFlag],
  name: "ls",
  summary: "List the volumes in your project",
});

export const volumeCommand = defineGroup({
  aliases: ["volumes"],
  default: "ls",
  name: "volume",
  subcommands: [lsSubcommand],
  summary: "List the volumes in your project",
});
```

`default` must name one of the subcommands, or the build fails. `nipa volume` and `nipa volume --json` run that subcommand.

## 2. Write the handler

Write the handler in `ls.ts`. `handle` types its `flags` and `args` from the declaration, so `flags.json` is `true` or absent, and the handler never reads a raw word:

```ts
import { listVolumes } from "../../util/volume";
import { handle } from "../../util/command";
import { lsSubcommand } from "./command";

export const ls = handle(lsSubcommand, async ({ client, flags }) => {
  const { active, service, session } = await client.cloud();
  const volumes = await listVolumes(await service("volumev3"));
  if (flags.json) {
    const { project } = session;
    client.stdout.json({ profile: active.name, project, volumes });
    return 0;
  }
  return 0;
});
```

The client holds what the handler needs for this run:

- **`client.cloud()`**: the session, and `service(type)` for each OpenStack API in Keystone's catalog
- **`client.stdout`**: where results go, such as JSON, or one ID per line in a pipe
- **`client.prompts`**: questions for the terminal, and `interactive` to check before you ask one

`client.cloud()` logs in first when the session expired and nipa can prompt. Messages go to stderr through `log`, `success` and `printTable` in `src/util/ui.ts`, not through `client.stdout`.

Pass `service()` the type your cloud's catalog lists for the API. `nipa os catalog list` shows them. Put the API calls in a module such as `src/util/volume.ts`, written like `src/util/compute.ts`, which parses each response with a zod schema. For the table that `nipa volume ls` prints without `--json`, follow `printServers` in `src/commands/server/ls.ts`.

## 3. Route the subcommands

Bind each subcommand to its handler in `index.ts`:

```ts
import { route } from "../../util/command";
import { volumeCommand } from "./command";
import { ls } from "./ls";

export const volume = route(volumeCommand, { ls });
```

The compiler checks this table against `subcommands`. A missing, extra or mismatched handler fails `bun run typecheck`.

## 4. Add the command to the table

Import the command in `src/commands/index.ts`, and add it to a section of the main help:

```ts
{ commands: [server, volume], title: "Resources" },
```

`test/commands.test.ts` fails when a folder in `src/commands` is missing from this table. It also fails when a name, alias or flag clashes with another one.

## 5. Test the command and add a changeset

Add a test to `test/cli.test.ts` that runs the command against the fake Keystone, and add the API's routes to `test/fake-keystone.ts`. Then run the checks that continuous integration (CI) runs, from the root of the repository:

```sh
bun run test
bun run check
bun run typecheck
```

Every pull request that changes what users see needs a changeset, which [Release nipa](releasing.md) explains.

import { jsonFlag } from "../../util/arg-common";
import { defineCommand, defineGroup } from "../../util/command";

const LIST_DATABASES = "List the databases in your project";

export const lsSubcommand = defineCommand({
  aliases: ["list"],
  args: [],
  flags: [jsonFlag],
  name: "ls",
  summary: LIST_DATABASES,
});

export const dbCommand = defineGroup({
  aliases: ["database", "databases"],
  default: "ls",
  description:
    "Lists the database clusters in your project with their engine, status, address, flavor and age. These are Nipa Cloud's managed databases, which `nipa server ls` doesn't show.",
  examples: [
    {
      command: "nipa db ls",
      description: LIST_DATABASES,
    },
    {
      command: "nipa db ls --json | jq -r '.databases[].name'",
      description: "Print each database's name",
    },
  ],
  name: "db",
  subcommands: [lsSubcommand],
  summary: LIST_DATABASES,
});

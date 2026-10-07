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

export const inspectSubcommand = defineCommand({
  args: [
    {
      arity: "one",
      name: "database",
      value: { kind: "resource", resource: "databases" },
    },
  ],
  flags: [jsonFlag],
  name: "inspect",
  summary: "Show a database's health, address, replicas, logs and backups",
});

export const dbCommand = defineGroup({
  aliases: ["database", "databases"],
  default: "ls",
  description:
    "Lists and inspects the database clusters in your project. These are Nipa Cloud's managed databases, which `nipa server ls` doesn't show. Name a database by its name or ID. `inspect` shows its status and health, where to connect, the ranges allowed to connect, its replicas, logs and recent backups, and ends with whether it's healthy.",
  examples: [
    {
      command: "nipa db ls",
      description: LIST_DATABASES,
    },
    {
      command: "nipa db inspect orders",
      description: "Check whether orders is healthy and where to connect",
    },
    {
      command: "nipa db ls --json | jq -r '.databases[].name'",
      description: "Print each database's name",
    },
  ],
  name: "db",
  subcommands: [lsSubcommand, inspectSubcommand],
  summary: "List and inspect your databases",
});

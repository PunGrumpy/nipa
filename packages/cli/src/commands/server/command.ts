import { jsonFlag } from "../../util/arg-common";
import { defineCommand, defineGroup } from "../../util/command";

const LIST_SERVERS = "List the servers in your project";

export const lsSubcommand = defineCommand({
  aliases: ["list"],
  args: [],
  flags: [jsonFlag],
  name: "ls",
  summary: LIST_SERVERS,
});

export const serverCommand = defineGroup({
  aliases: ["servers"],
  default: "ls",
  description:
    "Lists the servers in your project with their status, address, flavor and age. nipa calls the Space API, the one the Nipa Cloud Space portal uses, so you don't need the OpenStack client.",
  examples: [
    {
      command: "nipa server ls",
      description: LIST_SERVERS,
    },
    {
      command: "nipa server ls --json | jq -r '.servers[].name'",
      description: "Print each server's name",
    },
  ],
  name: "server",
  subcommands: [lsSubcommand],
  summary: LIST_SERVERS,
});

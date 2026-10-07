import { jsonFlag } from "../../util/arg-common";
import { defineCommand, defineGroup } from "../../util/command";

const LIST_NETWORKS = "List the networks in your project";

export const lsSubcommand = defineCommand({
  aliases: ["list"],
  args: [],
  flags: [jsonFlag],
  name: "ls",
  summary: LIST_NETWORKS,
});

export const networkCommand = defineGroup({
  aliases: ["networks"],
  default: "ls",
  description:
    "Lists the networks your project can use with their status, type, zone and age. A VPC network is one of your project's private networks, and an external network is a shared pool of external IPs.",
  examples: [
    {
      command: "nipa network ls",
      description: LIST_NETWORKS,
    },
    {
      command:
        "nipa network ls --json | jq -r '.networks[] | select(.external | not) | .name'",
      description: "Print the names of your VPC networks",
    },
  ],
  name: "network",
  subcommands: [lsSubcommand],
  summary: LIST_NETWORKS,
});

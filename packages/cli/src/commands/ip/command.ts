import { jsonFlag } from "../../util/arg-common";
import { defineCommand, defineGroup } from "../../util/command";

const LIST_IPS = "List the external IPs in your project";

export const lsSubcommand = defineCommand({
  aliases: ["list"],
  args: [],
  flags: [jsonFlag],
  name: "ls",
  summary: LIST_IPS,
});

export const ipCommand = defineGroup({
  aliases: ["ips"],
  default: "ls",
  description:
    "Lists the external IPs in your project with their status, the internal IP each one forwards to, zone and name. An IP without an internal IP isn't attached to anything.",
  examples: [
    {
      command: "nipa ip ls",
      description: LIST_IPS,
    },
    {
      command:
        "nipa ip ls --json | jq -r '.ips[] | select(.internalAddress == null) | .address'",
      description: "Print the IPs that aren't attached",
    },
  ],
  name: "ip",
  subcommands: [lsSubcommand],
  summary: LIST_IPS,
});

import { jsonFlag } from "../../util/arg-common";
import { defineCommand, defineGroup } from "../../util/command";

const LIST_VOLUMES = "List the volumes in your project";

export const lsSubcommand = defineCommand({
  aliases: ["list"],
  args: [],
  flags: [jsonFlag],
  name: "ls",
  summary: LIST_VOLUMES,
});

export const volumeCommand = defineGroup({
  aliases: ["volumes"],
  default: "ls",
  description:
    "Lists the block storage volumes in your project with their status, size, type, the server each one is attached to, and age.",
  examples: [
    {
      command: "nipa volume ls",
      description: LIST_VOLUMES,
    },
    {
      command:
        "nipa volume ls --json | jq -r '.volumes[] | select(.status == \"available\") | .id'",
      description: "Print the volumes that no server uses",
    },
  ],
  name: "volume",
  subcommands: [lsSubcommand],
  summary: LIST_VOLUMES,
});

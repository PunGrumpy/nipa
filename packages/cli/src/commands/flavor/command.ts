import { jsonFlag } from "../../util/arg-common";
import { defineCommand, defineGroup } from "../../util/command";

const LIST_FLAVORS = "List the flavors a server can have";

export const lsSubcommand = defineCommand({
  aliases: ["list"],
  args: [],
  flags: [jsonFlag],
  name: "ls",
  summary: LIST_FLAVORS,
});

export const flavorCommand = defineGroup({
  aliases: ["flavors", "machine-types"],
  default: "ls",
  description:
    "Lists the flavors a server can have, smallest first, with their vCPUs, RAM and type. The Space portal calls them machine types. The ones only database clusters use don't show.",
  examples: [
    {
      command: "nipa flavor ls",
      description: LIST_FLAVORS,
    },
    {
      command:
        "nipa flavor ls --json | jq -r '.flavors[] | select(.vcpus == 4) | .name'",
      description: "Print the flavors with 4 vCPUs",
    },
  ],
  name: "flavor",
  subcommands: [lsSubcommand],
  summary: LIST_FLAVORS,
});

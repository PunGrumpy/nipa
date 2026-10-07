import { jsonFlag } from "../../util/arg-common";
import { defineCommand, defineGroup } from "../../util/command";

const LIST_QUOTAS = "Show how much of each quota your project uses";

export const lsSubcommand = defineCommand({
  aliases: ["list"],
  args: [],
  flags: [jsonFlag],
  name: "ls",
  summary: LIST_QUOTAS,
});

export const quotaCommand = defineGroup({
  aliases: ["quotas", "limits"],
  default: "ls",
  description:
    "Shows each quota of your project, such as servers, vCPUs and RAM, with how much it uses, its limit, and the percent used. A quota at 80% or more is near its limit. One at 100% is at its limit, so creating one more of that resource fails. The command exits 0 either way. When the output goes to a pipe, nipa prints one tab-separated line per quota: its group and name, such as `compute/ram`, the amount used, the limit or `unlimited`, and the unit, such as `MB`, or `-` for a count.",
  examples: [
    {
      command: "nipa quota",
      description: LIST_QUOTAS,
    },
    {
      command:
        "nipa quota --json | jq '.quotas[] | select(.limit != null and .used >= .limit)'",
      description: "Print the quotas at their limit",
    },
  ],
  name: "quota",
  subcommands: [lsSubcommand],
  summary: LIST_QUOTAS,
});

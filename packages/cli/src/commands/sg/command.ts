import { jsonFlag } from "../../util/arg-common";
import { defineCommand, defineGroup } from "../../util/command";

const LIST_SECURITY_GROUPS = "List the security groups in your project";

export const lsSubcommand = defineCommand({
  aliases: ["list"],
  args: [],
  flags: [jsonFlag],
  name: "ls",
  summary: LIST_SECURITY_GROUPS,
});

export const sgCommand = defineGroup({
  aliases: ["security-group", "security-groups"],
  default: "ls",
  description:
    "Lists the security groups in your project with their inbound and outbound rule counts, age and description. `--json` prints each rule's direction, protocol, ports and remote.",
  examples: [
    {
      command: "nipa sg ls",
      description: LIST_SECURITY_GROUPS,
    },
    {
      command:
        "nipa sg ls --json | jq '.securityGroups[] | select(.name == \"web\") | .rules'",
      description: "Print the rules of the web security group",
    },
  ],
  name: "sg",
  subcommands: [lsSubcommand],
  summary: LIST_SECURITY_GROUPS,
});

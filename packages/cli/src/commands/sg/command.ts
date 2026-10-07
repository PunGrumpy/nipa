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

export const inspectSubcommand = defineCommand({
  args: [
    {
      arity: "one",
      name: "group",
      value: { kind: "resource", resource: "security-groups" },
    },
  ],
  flags: [jsonFlag],
  name: "inspect",
  summary: "Show a security group's rules and the servers that use it",
});

export const sgCommand = defineGroup({
  aliases: ["security-group", "security-groups"],
  default: "ls",
  description:
    "Lists and inspects the security groups in your project. Name a group by its name or ID. `nipa sg inspect` shows a group's inbound and outbound rules and the servers that use it, and notes when a rule opens SSH, RDP or a database port to the internet. `--json` prints each rule's direction, protocol, ports and remote.",
  examples: [
    {
      command: "nipa sg ls",
      description: LIST_SECURITY_GROUPS,
    },
    {
      command: "nipa sg inspect web",
      description: "Show the rules of the web security group and its servers",
    },
    {
      command:
        "nipa sg inspect web --json | jq -r '.securityGroup.servers[].name'",
      description: "Print the name of each server that uses web",
    },
  ],
  name: "sg",
  subcommands: [lsSubcommand, inspectSubcommand],
  summary: "List and inspect your security groups",
});

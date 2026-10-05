import { jsonFlag } from "../../util/arg-common";
import { defineCommand, defineGroup } from "../../util/command";

const LIST_LOAD_BALANCERS = "List the load balancers in your project";

export const lsSubcommand = defineCommand({
  aliases: ["list"],
  args: [],
  flags: [jsonFlag],
  name: "ls",
  summary: LIST_LOAD_BALANCERS,
});

export const lbCommand = defineGroup({
  aliases: ["loadbalancer", "loadbalancers"],
  default: "ls",
  description:
    "Lists the load balancers in your project with their status, health, virtual IP, listener count and age.",
  examples: [
    {
      command: "nipa lb ls",
      description: LIST_LOAD_BALANCERS,
    },
    {
      command: "nipa lb ls --json | jq -r '.loadBalancers[].address'",
      description: "Print each load balancer's virtual IP",
    },
  ],
  name: "lb",
  subcommands: [lsSubcommand],
  summary: LIST_LOAD_BALANCERS,
});

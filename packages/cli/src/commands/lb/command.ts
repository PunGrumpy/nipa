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

export const inspectSubcommand = defineCommand({
  args: [
    {
      arity: "one",
      name: "lb",
      value: { kind: "resource", resource: "load-balancers" },
    },
  ],
  flags: [jsonFlag],
  name: "inspect",
  summary: "Show a load balancer's listeners, backend groups and members",
});

export const lbCommand = defineGroup({
  aliases: ["loadbalancer", "loadbalancers"],
  default: "ls",
  description:
    "Lists and inspects the load balancers in your project. Name a load balancer by its name or ID. `inspect` shows each listener, backend group and member with its status, and ends with what stops the load balancer from serving, such as a listener in error or members that are down.",
  examples: [
    {
      command: "nipa lb ls",
      description: LIST_LOAD_BALANCERS,
    },
    {
      command: "nipa lb inspect web-lb",
      description: "Show why web-lb isn't serving",
    },
    {
      command: "nipa lb ls --json | jq -r '.loadBalancers[].address'",
      description: "Print each load balancer's virtual IP",
    },
  ],
  name: "lb",
  subcommands: [lsSubcommand, inspectSubcommand],
  summary: "List and inspect your load balancers",
});

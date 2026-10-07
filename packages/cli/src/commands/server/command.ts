import { jsonFlag, yesFlag } from "../../util/arg-common";
import { defineCommand, defineGroup } from "../../util/command";
import type { ArgSpec, FlagSpec } from "../../util/spec";

const LIST_SERVERS = "List the servers in your project";

const serverArg = {
  arity: "one",
  name: "server",
  value: { kind: "resource", resource: "servers" },
} as const satisfies ArgSpec;

const waitFlags = [
  {
    description: "Return once the Space API takes the action, without waiting",
    long: "no-wait",
    value: { kind: "none" },
  },
  {
    description: "How long to wait, such as 90s or 10m (default: 5m)",
    long: "timeout",
    value: { kind: "text", name: "duration" },
  },
] as const satisfies readonly FlagSpec[];

export const lsSubcommand = defineCommand({
  aliases: ["list"],
  args: [],
  flags: [jsonFlag],
  name: "ls",
  summary: LIST_SERVERS,
});

export const inspectSubcommand = defineCommand({
  args: [serverArg],
  flags: [jsonFlag],
  name: "inspect",
  summary: "Show a server's flavor, addresses, volumes and security groups",
});

export const logsSubcommand = defineCommand({
  args: [serverArg],
  flags: [
    {
      description: "Print only the last n lines",
      long: "tail",
      short: "n",
      value: { kind: "text", name: "n" },
    },
    jsonFlag,
  ],
  name: "logs",
  summary: "Print a server's console log",
});

export const historySubcommand = defineCommand({
  aliases: ["events"],
  args: [serverArg],
  flags: [jsonFlag],
  name: "history",
  summary: "List what was done to a server, newest first",
});

export const startSubcommand = defineCommand({
  args: [serverArg],
  flags: [...waitFlags],
  name: "start",
  summary: "Start a stopped server",
});

export const stopSubcommand = defineCommand({
  args: [serverArg],
  flags: [yesFlag, ...waitFlags],
  name: "stop",
  summary: "Stop a server",
});

export const restartSubcommand = defineCommand({
  aliases: ["reboot"],
  args: [serverArg],
  flags: [yesFlag, ...waitFlags],
  name: "restart",
  summary: "Restart a server",
});

export const serverCommand = defineGroup({
  aliases: ["servers"],
  default: "ls",
  description:
    "Lists, inspects, starts, stops and restarts the servers in your project, and shows what was done to a server and its console log. Name a server by its name or ID. `logs` prints the last 100 lines of the console log, which is what the Space API sends. nipa calls the Space API, the one the Nipa Cloud Space portal uses, so you don't need the OpenStack client. start, stop and restart wait until the server finishes, for 5 minutes or `--timeout`. `--no-wait` returns once the Space API takes the action.",
  examples: [
    {
      command: "nipa server ls",
      description: LIST_SERVERS,
    },
    {
      command: "nipa server inspect web-1",
      description: "Show web-1's addresses, volumes and security groups",
    },
    {
      command: "nipa server history web-1",
      description: "List web-1's actions, such as a create that failed",
    },
    {
      command: "nipa server logs web-1 --tail 20",
      description: "Print the last 20 lines of web-1's console log",
    },
    {
      command: "nipa server stop web-1 --yes",
      description: "Stop web-1 without asking",
    },
    {
      command: "nipa server start web-1 --no-wait",
      description: "Start web-1 without waiting for it",
    },
    {
      command: "nipa server ls --json | jq -r '.servers[].name'",
      description: "Print each server's name",
    },
  ],
  name: "server",
  subcommands: [
    lsSubcommand,
    inspectSubcommand,
    historySubcommand,
    logsSubcommand,
    startSubcommand,
    stopSubcommand,
    restartSubcommand,
  ],
  summary:
    "List, inspect, start, stop and restart your servers, and read their history and logs",
});

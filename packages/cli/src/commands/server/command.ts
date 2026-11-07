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

export const searchSubcommand = defineCommand({
  args: [{ arity: "optional", name: "query", value: { kind: "text" } }],
  description:
    "Looks in every project you can use for servers whose name, ID or address contains the query, ignoring case. The query is plain text, not a pattern, and without one nipa lists every server. nipa asks each project live and saves nothing, so a server that the portal, Terraform or Kubernetes just made shows up. It reads four projects at a time and gives up on one that takes more than 15 seconds. A folder's link doesn't narrow it. With `-p`, nipa searches only that project. When a project fails, nipa still prints the servers it found, then lists the projects it couldn't read and exits with code 1.",
  examples: [
    {
      command: "nipa server search web",
      description: "Find the servers named like web in every project",
    },
    {
      command: "nipa server search 203.0.113.10",
      description: "Find the server that has an address, in any project",
    },
    {
      command: "nipa -p Beta server search web",
      description: "Search only the Beta project",
    },
    {
      command: "nipa server search web --json | jq -r '.servers[].id'",
      description: "Print the ID of each match",
    },
  ],
  flags: [jsonFlag],
  name: "search",
  summary: "Find servers by name, ID or address in every project",
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
    "Lists, searches, inspects, starts, stops and restarts the servers in your project, and shows what was done to a server and its console log. Name a server by its name or ID. `logs` prints the last 100 lines of the console log, which is what the Space API sends. nipa calls the Space API, the one the Nipa Cloud Space portal uses, so you don't need the OpenStack client. start, stop and restart wait until the server finishes, for 5 minutes or `--timeout`. `--no-wait` returns once the Space API takes the action.",
  examples: [
    {
      command: "nipa server ls",
      description: LIST_SERVERS,
    },
    {
      command: "nipa server search web",
      description: "Find the servers named like web in every project",
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
      command: "nipa server ls | grep web",
      description: "Find the lines with web in any field",
    },
    {
      command: "nipa server ls | tail -n +2 | cut -f1",
      description: "Print each server's ID",
    },
    {
      command:
        "nipa server ls | awk -F'\\t' '$2 ~ /^web/ {print $1}' | xargs -n1 nipa server stop --yes",
      description: "Stop the servers whose name starts with web, by ID",
    },
    {
      command: "nipa server ls --json | jq -r '.servers[].name'",
      description: "Print each server's name",
    },
  ],
  name: "server",
  subcommands: [
    lsSubcommand,
    searchSubcommand,
    inspectSubcommand,
    historySubcommand,
    logsSubcommand,
    startSubcommand,
    stopSubcommand,
    restartSubcommand,
  ],
  summary:
    "List, search, inspect, start, stop and restart your servers, and read their history and logs",
});

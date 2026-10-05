import { jsonFlag, yesFlag } from "../../util/arg-common";
import { defineCommand, defineGroup } from "../../util/command";

export const lsSubcommand = defineCommand({
  args: [],
  flags: [jsonFlag],
  name: "ls",
  summary: "List your profiles and who is logged in to each",
});

export const addSubcommand = defineCommand({
  args: [{ arity: "optional", name: "name", value: { kind: "text" } }],
  flags: [
    {
      description: "Keystone URL, ending in /v3",
      long: "auth-url",
      value: { kind: "text", name: "url" },
    },
    {
      description: "User domain (default: nipacloud)",
      long: "user-domain",
      value: { kind: "text", name: "domain" },
    },
    {
      description: "Region (default: NCP-TH)",
      long: "region",
      value: { kind: "text", name: "region" },
    },
    {
      description:
        "Space portal URL, such as https://space.nipa.cloud (default: production's for production's Keystone)",
      long: "space-url",
      value: { kind: "text", name: "url" },
    },
    {
      description: "Make it the current profile",
      long: "use",
      value: { kind: "none" },
    },
  ],
  name: "add",
  summary: "Add a profile, asking for missing values",
});

export const useSubcommand = defineCommand({
  args: [{ arity: "optional", name: "name", value: { kind: "profile" } }],
  flags: [],
  name: "use",
  summary: "Make a profile the current one",
});

export const rmSubcommand = defineCommand({
  args: [{ arity: "one", name: "name", value: { kind: "profile" } }],
  flags: [{ ...yesFlag, description: "Remove it without asking" }],
  name: "rm",
  summary: "Remove a profile and log out of it",
});

export const profileCommand = defineGroup({
  default: "ls",
  description:
    "A profile is a Keystone URL, user domain, region and Space API URL with its own session. nipa starts with prod, which is Nipa Cloud production. Add a profile for staging or any other Keystone, then use it with `nipa profile use <name>` or `-P <name>`.",
  examples: [
    {
      command:
        "nipa profile add staging --auth-url https://keystone.example.com/v3",
      description: "Add a staging profile",
    },
    {
      command: "nipa profile use staging",
      description: "Make staging the current profile",
    },
  ],
  name: "profile",
  subcommands: [lsSubcommand, addSubcommand, useSubcommand, rmSubcommand],
  summary: "Manage Keystone profiles, such as staging",
});

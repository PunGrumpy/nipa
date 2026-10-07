import { defineCommand } from "../../util/command";

/** The kinds of resource with a page in the Space portal, named like their commands. */
export const RESOURCES = [
  "server",
  "volume",
  "network",
  "sg",
  "lb",
  "db",
] as const;

export type Resource = (typeof RESOURCES)[number];

export const openCommand = defineCommand({
  args: [
    {
      arity: "optional",
      name: "resource",
      value: { choices: RESOURCES, kind: "choice" },
    },
    { arity: "optional", name: "name", value: { kind: "text" } },
  ],
  description:
    "Opens the Nipa Cloud Space portal of the profile this run uses, like the Vercel CLI's `vercel open`. Name a kind of resource, `server`, `volume`, `network`, `sg`, `lb` or `db`, to open its list, and a name or ID after it to open that resource's page, which needs a session. The portal keeps its own login and opens the project you last used in it, so a link can't pick the project. When the output goes to a pipe, or with `--url`, nipa prints only the URL and doesn't open a browser.",
  examples: [
    {
      command: "nipa open",
      description: "Open the Space portal",
    },
    {
      command: "nipa open server web-1",
      description: "Open web-1's page",
    },
    {
      command: "nipa open lb",
      description: "Open the list of load balancers",
    },
    {
      command: "nipa open db orders --url",
      description: "Print the orders database's URL",
    },
  ],
  flags: [
    {
      description: "Print the URL instead of opening a browser",
      long: "url",
      value: { kind: "none" },
    },
  ],
  name: "open",
  summary: "Open the Space portal in your browser",
});

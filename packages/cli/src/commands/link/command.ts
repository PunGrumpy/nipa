import { defineCommand } from "../../util/command";

export const linkCommand = defineCommand({
  args: [{ arity: "optional", name: "project", value: { kind: "project" } }],
  description:
    "Links this folder to a project, by name or ID, like the Vercel CLI's `vercel link`. nipa saves the profile and the project in .nipa/project.json, and every command in this folder and the folders below it uses them, without changing the project other folders use. Without a project, nipa lists your projects to pick from.",
  examples: [
    {
      command: "nipa -P staging link Prototype",
      description: "Use staging's Prototype project in this folder",
    },
    {
      command: "nipa tf plan",
      description: "Run terraform with the linked project",
    },
  ],
  flags: [],
  name: "link",
  summary: "Use a project in this folder",
});

import { defineCommand } from "../../util/command";

export const switchCommand = defineCommand({
  args: [{ arity: "optional", name: "project", value: { kind: "project" } }],
  description:
    "Scopes the session to another project, by name or ID, without a password or OTP code. Without a project, nipa lists your projects to pick from.",
  flags: [],
  name: "switch",
  summary: "Use another project",
});

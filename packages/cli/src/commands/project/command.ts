import { jsonFlag } from "../../util/arg-common";
import { defineCommand, defineGroup } from "../../util/command";

const LIST_PROJECTS = "List the projects you can use";

export const lsSubcommand = defineCommand({
  aliases: ["list"],
  args: [],
  description:
    "Lists the projects your session can use in the current profile, with their IDs. It reads the saved session, so a linked folder or `--project` doesn't change the list.",
  flags: [jsonFlag],
  name: "ls",
  summary: LIST_PROJECTS,
});

export const projectCommand = defineGroup({
  aliases: ["projects"],
  default: "ls",
  description:
    "Lists the projects your session can use in the current profile, by name and ID. Use a name or ID with `--project` for one run, or with `nipa switch` to change the saved project.",
  examples: [
    {
      command: "nipa project ls",
      description: LIST_PROJECTS,
    },
    {
      command:
        "nipa project ls --json | jq -r '.projects[] | select(.current | not) | .id'",
      description: "Print the IDs of the projects you aren't using",
    },
  ],
  name: "project",
  subcommands: [lsSubcommand],
  summary: LIST_PROJECTS,
  usesProject: false,
});

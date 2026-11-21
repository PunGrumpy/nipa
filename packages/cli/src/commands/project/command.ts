import { jsonFlag } from "../../util/arg-common";
import { defineCommand, defineGroup } from "../../util/command";

const LIST_PROJECTS = "List the projects you can use";

export const lsSubcommand = defineCommand({
  aliases: ["list"],
  args: [],
  description:
    "Lists the projects your session can use in the current profile, with their IDs. The list belongs to the profile, so a linked folder changes it only by naming another profile, and `--project` is refused with exit code 2. `(current)` marks the project that commands in this folder use, which is the folder's link or else the saved project, and `(saved)` marks the saved project when the folder uses another.",
  flags: [jsonFlag],
  name: "ls",
  summary: LIST_PROJECTS,
});

export const projectCommand = defineGroup({
  aliases: ["projects"],
  default: "ls",
  description:
    "Lists the projects your session can use in the current profile, by name and ID, and marks the one that commands in this folder use. Pass a name or ID to `--project` on another command for one run, or to `nipa switch` to change the saved project.",
  examples: [
    {
      command: "nipa project ls",
      description: LIST_PROJECTS,
    },
    {
      command:
        "nipa project ls --json | jq -r '.projects[] | select(.current | not) | .id'",
      description: "Print the IDs of the projects this folder doesn't use",
    },
  ],
  name: "project",
  subcommands: [lsSubcommand],
  summary: LIST_PROJECTS,
  usesProject: false,
});

import { defineCommand } from "../../util/command";

export const unlinkCommand = defineCommand({
  args: [],
  description:
    "Deletes the .nipa/project.json that links this folder, or the closest folder above it, so commands here use the current profile and project again.",
  flags: [],
  name: "unlink",
  summary: "Stop using a linked project in this folder",
});

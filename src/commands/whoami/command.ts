import { jsonFlag } from "../../util/arg-common";
import { defineCommand } from "../../util/command";

export const whoamiCommand = defineCommand({
  args: [],
  description:
    "Prints your user, profile, project and when the session expires. When the output goes to a pipe, nipa prints only your user name.",
  flags: [jsonFlag],
  name: "whoami",
  summary: "Show who you're logged in as",
});

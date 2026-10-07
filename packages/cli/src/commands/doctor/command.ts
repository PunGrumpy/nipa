import { jsonFlag } from "../../util/arg-common";
import { defineCommand } from "../../util/command";

export const doctorCommand = defineCommand({
  args: [],
  description:
    "Checks the config files, the profile, Keystone, the Space API, the session and its token, the folder's link, openstack and terraform, and the last update check, then says how to fix each problem. It changes nothing and never asks for a password. It exits with code 1 when a check fails.",
  examples: [
    { command: "nipa doctor", description: "Check the current profile" },
    {
      command: "nipa -P staging doctor --json",
      description: "Check the staging profile and print JSON",
    },
  ],
  flags: [jsonFlag],
  name: "doctor",
  summary: "Check your setup and say what to fix",
});

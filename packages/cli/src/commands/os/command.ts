import { definePassthrough } from "../../util/command";

export const osCommand = definePassthrough({
  aliases: ["openstack"],
  description:
    "Runs `openstack <args...>` with the session. It's the same as `nipa exec openstack <args...>`.",
  examples: [
    {
      command: "nipa os volume list",
      description: "List the volumes in your project",
    },
  ],
  name: "os",
  summary: "Run openstack with the session",
  target: { kind: "openstack" },
});

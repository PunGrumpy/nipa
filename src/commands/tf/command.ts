import { definePassthrough } from "../../util/command";

export const tfCommand = definePassthrough({
  aliases: ["terraform"],
  description:
    "Runs `terraform <args...>` with the session. It's the same as `nipa exec terraform <args...>`.",
  examples: [
    {
      command: "nipa -P staging tf plan",
      description: "Plan against the staging profile",
    },
  ],
  name: "tf",
  summary: "Run terraform with the session",
  target: { kind: "program", program: "terraform" },
});

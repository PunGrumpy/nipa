import { defineCommand } from "../../util/command";
import { COMPLETE_KINDS } from "../../util/completion";

export const completeCommand = defineCommand({
  args: [
    {
      arity: "one",
      name: "kind",
      value: { choices: COMPLETE_KINDS, kind: "choice" },
    },
    { arity: "rest", name: "words", value: { kind: "text" } },
  ],
  flags: [],
  name: "__complete",
  summary: "Print values for the completion scripts",
  updateNotice: false,
});

import { defineCommand } from "../../util/command";
import { SHELLS } from "../../util/env";

export const envCommand = defineCommand({
  args: [],
  description:
    'Prints the session\'s OS_* variables as shell commands. Load them with `eval "$(nipa env)"` in bash or zsh, or with `nipa env | source` in fish.',
  flags: [
    {
      description: "Shell syntax to print (default: from $SHELL)",
      long: "shell",
      value: { choices: SHELLS, kind: "choice" },
    },
  ],
  name: "env",
  summary: "Print the OS_* variables for your shell",
});

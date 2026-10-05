import { defineCommand } from "../../util/command";
import { COMPLETION_SHELLS } from "../../util/completion";

export const completionCommand = defineCommand({
  args: [
    {
      arity: "optional",
      name: "shell",
      value: { choices: COMPLETION_SHELLS, kind: "choice" },
    },
  ],
  description:
    "Prints the tab completion script for bash, zsh, fish or PowerShell. Without a shell, nipa uses the one in $SHELL. Load the script from your shell's startup file, or save it with --install where the shell loads it, and nipa rewrites it when nipa updates.",
  examples: [
    {
      command: "echo 'eval \"$(nipa completion zsh)\"' >> ~/.zshrc",
      description: "Load it each time zsh starts",
    },
    {
      command: "nipa completion --install",
      description: "Save it for the shell in $SHELL",
    },
  ],
  flags: [
    {
      description: "Save it where the shell loads it, instead of printing it",
      long: "install",
      value: { kind: "none" },
    },
  ],
  name: "completion",
  summary: "Print or install the tab completion script for your shell",
  updateNotice: false,
});

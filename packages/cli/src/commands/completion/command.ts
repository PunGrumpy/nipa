import { defineCommand } from "../../util/command";
import { COMPLETION_SHELLS } from "../../util/completion";

export const completionCommand = defineCommand({
  args: [
    {
      arity: "one",
      name: "shell",
      value: { choices: COMPLETION_SHELLS, kind: "choice" },
    },
  ],
  description:
    "Prints the tab completion script for bash, zsh, fish or PowerShell. Load it from your shell's startup file.",
  examples: [
    {
      command: "echo 'eval \"$(nipa completion zsh)\"' >> ~/.zshrc",
      description: "zsh",
    },
    {
      command: "nipa completion fish > ~/.config/fish/completions/nipa.fish",
      description: "fish",
    },
  ],
  flags: [],
  name: "completion",
  summary: "Print the tab completion script for your shell",
  updateNotice: false,
});

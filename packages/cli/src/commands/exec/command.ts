import { definePassthrough } from "../../util/command";

export const execCommand = definePassthrough({
  description:
    "Runs a command with the session's OS_* variables. nipa removes any OS_* variable already in your shell first, so a stale OS_PASSWORD from an old openrc can't override the token. nipa exits with the command's exit code.",
  examples: [
    {
      command: "nipa exec ansible-playbook site.yml",
      description: "Run an Ansible playbook",
    },
  ],
  name: "exec",
  summary: "Run any command with the session",
  target: { kind: "command" },
});

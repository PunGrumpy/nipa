---
"nipa-cli": patch
---

nipa now never prompts when an AI coding agent runs it, which it detects from variables such as `CLAUDECODE`, `CURSOR_AGENT` and `AI_AGENT`. A command that needs an answer fails at once and names the flag to pass, as it does in CI, where it used to wait on a prompt the agent couldn't see. Output stays the same, and `env -u CLAUDECODE nipa login` runs one command with prompts.

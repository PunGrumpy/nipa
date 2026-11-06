---
"nipa-cli": patch
---

`nipa profile ls --json | head -1` no longer ends with a stack trace when the reader closes the pipe. nipa now decides colors for stdout and stderr separately, so `nipa profile ls 2>log` on a terminal stops writing color codes into the file, `CI=1 nipa --help | cat` is plain, and `FORCE_COLOR` and `NO_COLOR` behave as documented: `FORCE_COLOR=1` tints messages on a pipe but leaves piped help plain. Prompts follow the same decision, so `--no-color` also turns off the colors of a prompt. nipa no longer prompts or draws a spinner under `--json` or when `CI` has a value, which keeps a script from stopping at a login prompt and keeps spinner frames out of captured output, and the new `--non-interactive` option turns both off anywhere. The update notice is two lines instead of a box, shows only where nipa can prompt, and `NO_UPDATE_NOTIFIER` turns it off.

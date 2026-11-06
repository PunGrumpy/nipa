---
"nipa-cli": patch
---

`nipa profile ls --json | head -1` no longer ends with a stack trace when the reader closes the pipe. nipa now decides colors for stdout and stderr separately, so `nipa profile ls 2>log` on a terminal stops writing color codes into the file, `CI=1 nipa --help | cat` is plain, and `FORCE_COLOR` and `NO_COLOR` behave as documented. nipa no longer prompts under `--json` or when `CI` has a value, which keeps a script from stopping at a login prompt, and the new `--non-interactive` option turns prompts off anywhere. The update notice is two lines instead of a box, shows only where nipa can prompt, and `NO_UPDATE_NOTIFIER` turns it off.

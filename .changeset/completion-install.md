---
"nipa-cli": patch
---

Add `nipa completion --install`, which saves the tab completion script where bash, zsh or fish loads it, so the shell doesn't run nipa each time it starts. nipa rewrites the saved script when its version changes, so new commands complete after an update. `nipa completion` without a shell uses the one in `$SHELL`.

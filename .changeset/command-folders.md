---
"nipa-cli": minor
---

`nipa profile rm --help` and every other subcommand print their own help page, and `nipa server --json` runs `nipa server ls --json`. Usage errors name the command and show its usage line, and an extra argument, as in `nipa switch Beta extra`, exits with code 2.

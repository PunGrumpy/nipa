---
"nipa-cli": patch
---

`nipa server --help` and the other group pages now list only the options the group accepts on its own. They used to list every subcommand's options, such as `--timeout`, which `nipa server` rejects. Each subcommand's page still lists its own options.

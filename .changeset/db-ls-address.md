---
"nipa-cli": patch
---

`nipa db ls` shows a database's internal address when it has no external IP. The Address column was blank for these, and `--json` gave `externalAddress` as `""` instead of `null`.

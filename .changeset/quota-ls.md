---
"nipa-cli": patch
---

Add `nipa quota ls`, which shows each quota of your project, such as servers, vCPUs, RAM and volumes, by group, with how much it uses, its limit and the percent used. A quota at 80% or more shows in yellow and one at its limit in red, and a note counts them, so you can see why a create failed or how much room is left. `--json` prints each quota's group, name, used, limit and unit, and a pipe gets one tab-separated line per quota with its unit. `nipa quota`, `nipa quotas` and `nipa limits` do the same.

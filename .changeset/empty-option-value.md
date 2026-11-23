---
"nipa-cli": patch
---

An option given an empty value with `=`, such as `--profile=`, now fails with the same usage error as the option with no value at all, instead of running with an empty value.

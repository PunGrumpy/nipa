---
"nipa-cli": patch
---

`nipa os`, `nipa tf` and `nipa exec` run on a profile that has no Space API URL, such as one added with `nipa profile add` for another Keystone without `--space-url`. They failed with "has no Space API URL" since 0.1.5, although only `server ls` and the other resource commands need that URL. A program that can't start, such as a script whose `#!` interpreter is missing, exits with code 126 and a message instead of a stack trace.

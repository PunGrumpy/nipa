---
"nipa-cli": patch
---

Tab completion in bash no longer expands `$(…)` or `$VAR` inside a project, server, volume, image, network, security group, load balancer or database name that comes from Keystone or the Space API, and it escapes names with spaces or quotes so they insert as one word. Run `nipa completion --install` again, or restart your shell if it loads the script with `eval`, to pick up the new script.

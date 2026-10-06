---
"nipa-cli": patch
---

Add `nipa server inspect`, `start`, `stop` and `restart`, which take a server's name or ID. `inspect` shows the server's flavor with its vCPUs and RAM, zone, addresses, volumes and security groups, and `--json` prints them. `start`, `stop` and `restart` call the Space API, like the Space portal's buttons, then wait until the server finishes. `stop` and `restart` ask first, and `--yes` skips the question. `--no-wait` returns once the Space API takes the action, and `--timeout 10m` waits longer than the default 5 minutes. Tab completes server names after these commands. `nipa server ls --json` gives each server `vcpus`, `ramMb`, `zone`, `volumes` and `securityGroups` too.

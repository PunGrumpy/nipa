---
"nipa-cli": patch
---

Add `nipa db inspect`, which takes a database cluster's name or ID and answers whether it's healthy and how to reach it. It shows the engine and version, status, health and when Trove last checked it, flavor with its vCPUs and RAM, storage, zone, address with the engine's default port, allowed CIDRs, replicas, whether the general and slow query logs are on, and the 5 newest backups. Its last line says the database is healthy and where to connect, or what needs attention, such as a primary that isn't active or a latest backup that failed. `--json` prints all of it under `database`, with every backup and a `problems` list. `nipa db ls --json` gives each primary `id`, `port`, `zone`, `vcpus`, `ramMb`, `allowedCidrs` and `healthCheckedAt` too, and every status list colors completed backups green and failed ones red.

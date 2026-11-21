# Investigate and other resources

A user asks nipa what's wrong with a server, load balancer, database, volume or Kubernetes cluster, and lists the other resources in their project. Every command here only reads.

## Sub-features

- `investigate-ok` reports OK lines and warnings for a healthy server.
- `investigate-degraded` reports what nipa couldn't read instead of failing.
- `volume-ls` lists volumes with status, size, type, server and age.
- `resource-ls` lists flavors, networks, security groups, IPs, load balancers, Kubernetes clusters, databases and quotas the same way.

## How to get to it (user POV)

- Run `nipa investigate <name-or-id>`.
- Run `nipa volume ls`, `nipa network ls`, `nipa sg ls`, `nipa ip ls`, `nipa lb ls`, `nipa k8s ls`, `nipa db ls`, `nipa flavor ls` or `nipa quota`.
- Add `--json` to any of them for a script.

## Driving it with control-nipa

Preconditions:

- The baseline in the README holds, on a fresh run.

- **Healthy server.** Run `$C run --run "$RUN" -- investigate web-1`. Exit `0`, stdout is web-1's ID, and stderr has the warning `web-1 is locked` and ends with `No problem found in what nipa can see, and 1 warning.`
- **Degraded read.** Run `$C run --run "$RUN" -- server start db-1`, then `$C run --run "$RUN" -- investigate db-1`. The second command shows `Warning nipa couldn't read the server's state` with `error: Service Unavailable` and still prints its other checks.
- **Volumes.** Run `$C run --run "$RUN" -- volume ls`. Exit `0`, stdout lists three volume IDs, and the table shows `web-1-vol-0` `In use` on `web-1` and `backups` `Available`.
- **Other lists.** Run each of `$C run --run "$RUN" -- network ls`, `sg ls`, `ip ls`, `lb ls`, `k8s ls`, `db ls`, `flavor ls` and `quota`. Each exits `0` with a heading naming `Alpha` on stderr.

## Gotchas

- Investigate reads several Space API routes. A change to one of them can turn an OK line into a warning without a failure exit, so compare the lines, not only the exit code.
- The degraded recipe changes the fake's state, so `down` the run after it.
- The other lists are seeded only for Alpha. `-p Beta` answers with empty lists, which proves scoping but not rendering.

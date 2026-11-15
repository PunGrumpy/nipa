# Servers

A user lists the servers in their project, finds one across every project, reads its details, history and console log, and starts or stops it. Against the fake, start and stop change only the fake's memory.

## Sub-features

- `server-ls` lists the project's servers as a table, or as JSON.
- `server-search` finds servers by name, ID or address in every project, and says when none match.
- `server-inspect` shows one server's status, lock, flavor, addresses, volumes and security groups.
- `server-inspect-missing` fails with a hint that names `search` and `ls`.
- `server-history` lists the actions taken on a server.
- `server-logs` prints the console log.
- `server-power` starts and stops a server and reports a server already in the target state.
- `server-confirm` refuses to stop without `--yes` when nipa can't prompt.

## How to get to it (user POV)

- Run `nipa server ls` or `nipa server ls --json`.
- Run `nipa server search <query>`.
- Run `nipa server inspect <name-or-id>`, with or without `--json`.
- Run `nipa server history <name-or-id>` and `nipa server logs <name-or-id>`.
- Run `nipa server start|stop|restart <name-or-id>`.

## Driving it with control-nipa

Preconditions:

- The baseline in the README holds, on a fresh run.
- Alpha has `web-1` (Active, locked), `web-2` (Build), `db-1` and `legacy-node-1` (Shutoff).

- **List.** Run `$C run --run "$RUN" -- server ls`. Exit `0`, stdout is a TSV table with a header row `ID	Name	Status	Address	Flavor	Created` and six servers, and stderr has `Servers in Alpha`.
- **List as JSON.** Run `$C run --run "$RUN" -- server ls --json`. Exit `0`, and the JSON has `"profile": "prod"`, `project.name` `Alpha` and six entries in `servers`.
- **Search hit.** Run `$C run --run "$RUN" -- server search web`. Exit `0`, stdout lists `web-1` and `web-2`, and stderr reads `2 servers match "web" in 2 projects`.
- **Search miss.** Run `$C run --run "$RUN" -- server search zzz`. Exit `0`, stdout has only the header row, and stderr reads `No servers match "zzz" in 2 projects.`
- **Inspect.** Run `$C run --run "$RUN" -- server inspect web-1`. Exit `0`, stdout is the ID `22222222-2222-4222-8222-222222222222`, and stderr shows `Status ● Active`, `Locked yes` and `Volumes web-1-vol-0`.
- **Inspect a missing server.** Run `$C run --run "$RUN" -- server inspect nope`. Exit `1`, and stderr reads `Error: no server named or with ID "nope" in Alpha` with a hint naming `nipa server search nope` and `nipa server ls`.
- **History.** Run `$C run --run "$RUN" -- server history web-1`. Exit `0`, and the table lists `start`, `stop` and `create` by `Ann Example`.
- **Console log.** Run `$C run --run "$RUN" -- server logs web-1`. Exit `0`, and stdout ends in `web-1 login: ` with no trailing newline.
- **Start.** Run `$C run --run "$RUN" -- server start legacy-node-1`. Exit `0`, and stderr reads `Success! Started legacy-node-1 in Alpha`. Then run `$C run --run "$RUN" -- server inspect legacy-node-1 --json` and read `ACTIVE` as its status.
- **Stop needs confirmation.** Run `$C run --run "$RUN" -- server stop legacy-node-1`. Exit `2`, and stderr reads `Error: stopping legacy-node-1 needs confirmation` with ``Add `--yes` to stop it without asking.``
- **Stop.** Run `$C run --run "$RUN" -- server stop legacy-node-1 --yes`. Exit `0`, and stderr reads `Success! Stopped legacy-node-1 in Alpha`. Run it again, and stderr reads `NOTE: legacy-node-1 is already stopped` with exit `0`.

## Gotchas

- The fake keeps server status until `down`. A second `start` on the same run hits `already` instead of starting. Start each power recipe on a fresh run.
- `db-1` stops answering its state once an action reaches it, by design, so `server start db-1` fails with `Service Unavailable` and leaves db-1 Active. Use `legacy-node-1` for power recipes, and `db-1` only to prove the failure path.
- `web-1` is locked. A real cloud refuses to start or stop it. The fake doesn't model the lock for actions.
- `stop` and `restart` take `--yes`, and the helper's closed stdin makes it required. `start` asks nothing, so `server start <server> --yes` fails with `unknown option "--yes"`.
- Created times are relative to when the fake started, so don't assert them literally.

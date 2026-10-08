---
"nipa-cli": patch
---

Add `nipa server history` and `nipa server logs` to find out why a server failed. `history`, or `events`, lists the actions on a server, newest first, with who asked, the result and the request ID. `logs` prints the server's console log, cloud-init output included, and `--tail 20` keeps the last 20 lines. A server that never booted has no console log, so nipa says so and names `nipa server history`. `nipa server inspect` now shows Nova's task while the server is busy, whether it's locked, and its last action, such as `create failed 26m ago by Ann`, and names `history` and `logs` for a server in Error. `--json` prints all of it, and `inspect --json` adds `taskState`, `locked` and `lastAction` to the server.

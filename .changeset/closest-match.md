---
"nipa-cli": patch
---

nipa now suggests a command, subcommand, option, server name or project name only when exactly one is close to what you typed, where it used to suggest `nipa login` for `nipa logs`. `nipa server inpect web-1` suggests `nipa server inspect`, `nipa machine-type` suggests `nipa flavor`, `nipa logs web-1` suggests `nipa server logs`, `nipa server ls --jsno` suggests `--json`, and `nipa switch beta` suggests the project `Beta`.

A server that isn't in the project now points to `nipa server search <name>`, which looks in every project, before `nipa server ls`. In a `--json` error, the `next` of a missing server lists the search command first, so a script that ran `next[0]` now searches. A guess is in the hint and in the new `data.suggestion`, never in `next`.

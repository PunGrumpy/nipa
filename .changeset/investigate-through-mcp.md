---
"nipa-cli": patch
---

`nipa mcp` offers an `investigate` tool, so an AI assistant that you asked "Why is web-1 broken?" can ask nipa instead of piecing the answer together from several lists. It takes a `name` (a name or ID) and optionally a `kind` (`server`, `lb`, `db`, `volume` or `k8s`) and a `project`, runs the checks that `nipa investigate` runs, and returns the same `{ profile, project, investigation }` that `nipa investigate --json` prints: findings with problems first, each with the evidence it read and the commands to run next. When a name fits more than one kind, the tool returns the `ambiguous_name` error with each choice, and the assistant asks again with `kind`. The tool only reads, like the other 17.

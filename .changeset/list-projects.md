---
"nipa-cli": patch
---

`nipa project ls` lists the projects your session can use, with their names and IDs. In a terminal it prints a table and marks the project that commands in this folder use with `(current)`, which is the folder's link or else your saved project. When the folder uses another project, your saved one is marked `(saved)`. In a pipe it prints a header and one tab-separated line per project, so `nipa project ls | tail -n +2 | cut -f1` gives the IDs. `--json` prints the profile, your saved project and the folder's link as `nipa whoami --json` does, and the projects, each with `id`, `name` and `current`, which is `true` for the project that commands in this folder use. `nipa project`, `nipa projects` and `nipa project list` do the same. The list belongs to the profile, so a folder linked to another profile shows that profile's projects, and `-p` is refused: `nipa -p Beta project ls` exits with code 2.

`nipa mcp` has a new `list_projects` tool that returns the same document, so an AI assistant can find the `project` value that its other tools take. It takes no `project` of its own. Its `current` marks the project the other tools read when they get none: the `-p` that the server started with, else the folder's link, else your saved project.

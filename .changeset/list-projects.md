---
"nipa-cli": patch
---

`nipa project ls` lists the projects your session can use, with their names and IDs. In a terminal it prints a table, marks the project you use with `(current)`, and marks the one a linked folder uses with `(this folder)`. In a pipe it prints a header and one tab-separated line per project, so `nipa project ls | tail -n +2 | cut -f1` gives the IDs. `--json` prints the profile, your saved project, the folder's link and the projects, each with `id`, `name` and `current`. `nipa project`, `nipa projects` and `nipa project list` do the same. The command reads your saved session, so `-p` and a folder's link don't change the list, and `nipa -p Beta project ls` exits with code 2.

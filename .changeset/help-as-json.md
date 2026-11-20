---
"nipa-cli": patch
---

`nipa server stop --help --json`, `nipa help server stop --json`, `nipa --help --json` and `nipa help --all --json` now print help as one JSON document, with each command's path, usage, summary, subcommands, arguments, options and examples, and every command in the last. Before, `nipa --help --json` failed with `unknown option "--json"`, `nipa help --all --json` printed the main page as text, and the other two printed the text page. A script or an AI assistant can read these instead of parsing the help page. The human pages are unchanged.

`nipa help --json server` used to skip `--json` and print the text page of `server`. It now prints the JSON document, so a script that relied on the text page should drop `--json`.

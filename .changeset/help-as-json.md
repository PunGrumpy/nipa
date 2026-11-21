---
"nipa-cli": patch
---

`nipa server stop --help --json`, `nipa help server stop --json`, `nipa --help --json` and `nipa help --all --json` now print help as one JSON document, with each command's path, usage, summary, subcommands, arguments, options and examples, and every command in the last. Before, `nipa --help --json` failed with `unknown option "--json"`, `nipa help --all --json` printed the main page as text, and the other two printed the text page. A script or an AI assistant can read these instead of parsing the help page. The human pages are unchanged.

`nipa help --json server` and `nipa help --json` used to ignore `--json` and print the main page as text. They now print the JSON document of `server` and of the main page.

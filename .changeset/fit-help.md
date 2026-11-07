---
"nipa-cli": patch
---

`nipa --help` and every command's help now fit an 80-column terminal. The main page lists each command by its name and wraps a summary that doesn't fit under it, instead of listing every subcommand beside it, so the page is no longer 150 columns wide. Every other page replaces the long list of global options with `Global Options: nipa --help`, lists its options in alphabetical order, puts the summary right under the usage line, and shows each example as a description with the command below it and no `$`. The section titles are in Title Case, and bold magenta on a terminal.

`nipa --help --version` now prints the help, and `nipa whoami --version`, `nipa server stop web -y -v` or `nipa server stop -v` prints only the version, where they used to run the command or fail on its arguments. This changes exit codes: `nipa help nope`, `nipa help server nope` and `nipa server nope --help` used to print the main page or the server page and exit 0, and now fail with exit code 2 and the same unknown-command or unknown-subcommand error as the command line. Update a script that used `nipa help <anything>` to check that a command exists.

A typo in a request for help, such as `nipa help logot` or `nipa logot --help`, now suggests reading help with ``Did you mean `nipa help logout`?`` instead of the command itself. `nipa help --json server` and `nipa help -y server stop` skip the options before the name and print that page instead of the main page, and `nipa help help` prints the main page.

# Help, version and typos

A user checks which nipa they have, reads what each command does, and gets a suggestion when they mistype a command or subcommand. None of this needs a session or the network.

## Sub-features

- `version` prints the package version and nothing else.
- `help-main` lists every command group with the version in the heading.
- `help-command` shows usage, a description and options for one command.
- `typo-command` rejects an unknown command with exit 2 and a hint.
- `typo-subcommand` suggests the closest subcommand.

## How to get to it (user POV)

- Run `nipa --version` or `nipa -v`.
- Run `nipa --help`, `nipa -h` or `nipa` with no arguments.
- Run `nipa <command> --help`, such as `nipa server --help`.
- Mistype a command, such as `nipa nonsense` or `nipa server lss`.

## Driving it with control-nipa

Preconditions:

- The baseline in the README holds.

- **Version.** Run `$C run --run "$RUN" -- --version`. Exit `0`, and stdout is exactly the `version` of `packages/cli/package.json` plus a newline.
- **Main help.** Run `$C run --run "$RUN" -- --help`. Exit `0`, and the output starts with `nipa v<version>` and lists the `Usage: nipa [options] <command>` line.
- **Command help.** Run `$C run --run "$RUN" -- server --help`. Exit `0`, and the output shows `Usage: nipa server [ls|search|inspect|history|logs|start|stop|restart]`.
- **Unknown command.** Run `$C run --run "$RUN" -- nonsense`. Exit `2`, stdout is empty, and stderr reads `Error: unknown command "nonsense"` with the hint ``Run `nipa --help` to see the commands.``
- **Subcommand typo.** Run `$C run --run "$RUN" -- server lss`. Exit `2`, and stderr reads `Error: unknown subcommand "server lss"` with ``Did you mean `nipa server ls`?``

## Gotchas

- Help pages must fit in 80 columns. Check the longest line with `awk '{ print length }' <evidence> | sort -n | tail -1` when a change touches help text.
- `nipa os --help` and `nipa tf --help` print openstack's and terraform's help, not nipa's. The helper refuses them, so read their summary in `nipa --help`.
- Pass each word as its own argument. A shell that keeps `"server lss"` as one word gets `unknown command "server lss"` instead of the subcommand hint.

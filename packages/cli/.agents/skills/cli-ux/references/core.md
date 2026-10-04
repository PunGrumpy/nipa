# Core CLI UX rules

These rules cover the flow, streams, layout, errors and safety of every nipa command. Move each command you touch toward them, but keep the compatibility contracts at the end of this page unless the change migrates them on purpose, with tests.

## Streams

nipa writes results and messages to different streams, so a pipe gets only data:

- **stdout**: the command's result, through `client.stdout`: `json()` for `--json`, `line()` for bare values such as one server ID per line, and `write()` for raw text
- **stderr**: everything else: notes, success lines, errors, spinners, tables, prompts, debug lines and the update notice

Command folders never call `console.*`. `test/unit/commands/index.test.ts` fails when they do.

A command picks its stdout shape from the mode:

- With `--json`, stdout carries one JSON document, indented by 2, and nothing else. Messages may still go to stderr
- In a terminal without `--json`, the result is a human table or a set of `log` lines on stderr, and stdout stays empty
- In a pipe without `--json` (`client.stdout.isTTY` is false), stdout carries the bare values a script needs, one per line, such as `nipa server ls` printing IDs and `nipa whoami` printing the user name

Some commands exist to print for a pipe or `eval`, such as `nipa env` and `nipa completion`. They write their whole result to stdout in every mode.

## Output helpers

Use the helpers in `src/util/ui.ts` instead of hand-built lines:

| Helper | Prints to stderr | Use it for |
| --- | --- | --- |
| `log(message)` | `> message`, with a dim `>` | State, context and next steps |
| `success(message, elapsedMs?)` | `> Success! message [1s]` | The one line that confirms a completed change |
| `note(message)` | `> NOTE: message`, in bold yellow | A no-op or a condition the person should know about |
| `withSpinner(message, task)` | A spinner after 300 ms, in a terminal only, erased when `task` ends | Network calls and other waits |
| `printTable({ headings, rows, marks })` | A borderless table between blank lines, 2 spaces in | Lists of resources |
| `throw new CliError(message, options)` | `Error: message`, then `> hint`, through `printError` in `src/index.ts` | Failures |

Rules for the helpers:

- Print one `success` line per completed change. Add `log` lines after it only for state that changed as a side effect, such as `Now using prod`, or for the next command to run
- Pass `elapsedMs` to `success` when the command waited on the network, as `switch` and `profile add` do. Start the clock right before the remote work
- Spinner text is a present participle that ends with `…`: `Loading the servers in my-project…`, `Logging out…`
- `printTable` colors cells through `paint` after padding, so color codes never break column widths. Use `marks` for a one-character marker such as `✔` on the current profile, not an extra column
- Use `bold` for names the person typed or picked, `dim` for secondary detail in parentheses such as hosts and IDs, `cyan` for URLs, and `gray` for ages in tables
- Never put meaning only in color. `NO_COLOR=1` and `--no-color` turn every color off

## Flow

A command that resolves a target or changes state follows this order:

1. **Orient**: say which profile it uses when that isn't `prod`. `client.cloud()` does this through `announceProfile`
2. **Resolve**: take values from arguments and flags first, then infer them, then prompt for what's left
3. **Wait**: wrap each network call in `withSpinner`
4. **Change**: write local files after the remote call succeeds, so a failed call leaves the old state
5. **Confirm**: print one `success` line that names what changed
6. **Continue**: print the exact next command when there is one, such as ``Run `nipa login -P staging` to log in to it.``

Read-only commands skip steps 4 to 6 and print their result.

## Prompts

Prompt only when all of these hold:

- `client.prompts.interactive` is true, which means stdin and stderr are both terminals
- nipa can't infer the value
- no argument or flag supplied it

Never require a prompt. Without a terminal, fail with `usageError`, exit code 2, and a hint naming the flag or argument, as `profile add` does with `missing --auth-url`.

Prompt wording:

- Ask for one value per prompt, with a short noun label: `Profile name`, `Keystone URL`, `Region`
- Show the default when one exists, and accept it on Enter
- A yes/no prompt confirms a concrete action and names its object: `Remove profile staging and log out of it?`
- A destructive confirmation defaults to No, and `--yes` skips it
- Ask for secrets through `client.prompts.secret`, which masks the input

Ctrl-C inside a prompt throws `CliError("Canceled")` with exit code 130. Declining a destructive confirmation does the same.

## Lists

List commands print a scan-first table:

- Lead with a `log` line that names the scope and count or context, such as `Servers in my-project [1s]` or `2 profiles`
- Keep columns stable and print `-` for a missing value
- An empty list prints a `log` line such as `No servers in my-project` and exits 0. With `--json`, an empty list is `[]` inside the usual object, and exits 0
- Never treat an empty result as an error

## Errors

`CliError` carries a message, an optional hint, and an exit code. `src/index.ts` also turns `KeystoneError`, `ApiError`, `NetworkError` and `StoreError` into a `CliError` with a hint.

Each error says what failed, and its hint says how to fix it:

```text
Error: you aren't logged in to prod
> Run `nipa login`.
```

Rules:

- The message is a lowercase fragment without a final period. It names the object, quoting values the person typed: `no profile named "staging"`
- The hint is a full sentence that ends with a period. It names the exact command, flag or file to fix it, in backticks
- Use `usageError(message, hint)` when the command line was wrong. It exits with 2
- Suggest the closest command when a word is unknown, as the dispatcher does: ``Did you mean `nipa server`?``
- For a server-side or network failure, the hint points to `--debug` or to the Keystone URL
- Never print a stack trace, a raw response body, or an upstream error object. `src/index.ts` rethrows anything that isn't a known error, so wrap new error types there

## Secrets

nipa handles passwords, OTP codes and Keystone tokens:

- Never print a password, an OTP code or a token, in any mode, including `--debug`. `src/util/http.ts` logs only the method, URL, status and time
- `nipa env` is the one command that prints the token, because its output is meant for `eval`. Keep it on stdout only
- Files under the config directory are written with mode `0600` in a directory with mode `0700`. Keep that for any new file
- Never put a token or password in a suggested command or a hint

## Compatibility

Treat these as contracts. Change them only with a migration, tests, and a changeset when users see it:

- Command names, aliases, flags and their short forms
- Exit codes: 0 for success, 1 for a failure, 2 for a wrong command line, 127 when `os`, `tf` or `exec` can't find the program, 130 for Ctrl-C or a declined confirmation, and the child's code for passthrough commands
- Environment variables: `NIPA_PROFILE`, `NIPA_DEBUG`, `NIPA_CONFIG_DIR`, `NO_COLOR`, and the `OS_*` variables that `env`, `os`, `tf` and `exec` set
- The files in the config directory and their JSON shape
- `--json` field names and meanings. Add fields freely, but don't rename or remove them
- The bare values that piped stdout prints
- The completion scripts that `nipa completion <shell>` prints

Human output on stderr may change for clarity, as long as the tests change with it.

## Help

The help pages come from the specs in each `command.ts`:

- A `summary` is a sentence-case fragment without a final period that starts with a verb: `List the servers in your project`
- A `description` is full sentences. It says what the command does and anything surprising, such as `exec` removing stale `OS_*` variables
- Examples are real commands that run as written. Prefer a common workflow over a list of every flag
- `--help` exits 0. A group run without a subcommand runs its `default`

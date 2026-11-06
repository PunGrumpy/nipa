# Core CLI UX rules

These rules cover the flow, streams, layout, errors and safety of every nipa command. Move each command you touch toward them, but keep the compatibility contracts at the end of this page unless the change migrates them on purpose, with tests.

## Streams

nipa writes results and messages to different streams, so a pipe gets only data:

- **stdout**: the command's result, through `client.stdout`: `json()` for `--json`, `line()` for bare values such as one server ID per line, and `write()` for raw text
- **stderr**: everything else: notes, success lines, errors, spinners, tables, prompts, debug lines and the update notice (two lines, shown only when nipa can prompt). Under `--json`, stderr carries only a failure's error document and `--debug` lines. See [Machine errors](#machine-errors)

Command folders never call `console.*`. `test/unit/commands/index.test.ts` fails when they do.

A command picks its stdout shape from the mode:

- With `--json`, stdout carries one JSON document, indented by 2, and nothing else. `run()` turns on JSON mode for the whole run, in which `log`, `success`, `note`, `printTable`, `printFields` and the spinner write nothing, so a success leaves stderr empty. `--debug` lines still write. A passthrough command (`os`, `tf`, `exec`) turns the mode off, because a `--json` after its name belongs to its program
- In a terminal without `--json`, the result is a human table or a set of `log` lines on stderr, and stdout stays empty
- In a pipe without `--json` (`client.stdout.isTTY` is false), stdout carries the bare values a script needs, one per line, such as `nipa server ls` printing IDs and `nipa whoami` printing the user name

Some commands exist to print for a pipe or `eval`, such as `nipa env` and `nipa completion`. They write their whole result to stdout in every mode.

A reader that quits early, as `nipa server ls | head -1` does, closes the pipe. `src/index.ts` ignores the EPIPE that follows on stdout and stderr, so the command keeps its own exit code. It rethrows any other stream error.

### Color

`src/util/theme.ts` decides color once per run and once per stream, because help goes to stdout and everything else to stderr, and the two can differ. It is the only module that imports `picocolors`; a test fails on any other import. Highest first:

1. `--no-color` before `--`
2. A nonempty `NO_COLOR`
3. `FORCE_COLOR`, where `0` and `false` mean off and any other value means on. On stderr it turns color on for a pipe, and everything nipa paints there takes it. Help, the only thing painted for stdout, stays plain in a pipe even when forced
4. Whether that stream is a terminal and `TERM` isn't `dumb`

`CI` says nothing about color. `help.ts` paints with the stdout palette, so help has color only on a terminal with `TERM` not `dumb`, and `ui.ts`, `http.ts` and `update.ts` paint with the stderr one, through the `bold`, `cyan` and other exports of `ui.ts`. A command that writes to `client.stdout` paints nothing, so `--json` stays free of escape codes even with `FORCE_COLOR=1`.

## Output helpers

Use the helpers in `src/util/ui.ts` instead of hand-built lines:

| Helper | Prints to stderr | Use it for |
| --- | --- | --- |
| `log(message)` | `> message`, with a dim `>` | State, context and next steps |
| `success(message, elapsedMs?)` | `> Success! message [1s]` | The one line that confirms a completed change |
| `note(message)` | `> NOTE: message`, in bold yellow | A no-op or a condition the person should know about |
| `withSpinner(message, task)` | A spinner after 300 ms, erased when `task` ends. Only where nipa can prompt, and never with `TERM=dumb` | Network calls and other waits |
| `printTable({ headings, rows, marks })` | A borderless table between blank lines, 2 spaces in | Lists of resources |
| `throw new CliError(message, options)` | `Error: message`, then `> hint`, through `printError` in `src/index.ts`. Under `--json`, one error document instead | Failures |

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

- `client.prompts.interactive` is true. It is false when any of these holds: `--non-interactive`, `--json` before `--` in the leaf's words (passthrough commands excluded), a nonempty `CI`, or a stdin or stderr that isn't a terminal. `src/util/ui.ts` resolves it once per run in `createPrompts`
- nipa can't infer the value
- no argument or flag supplied it

Never require a prompt. When nipa can't prompt, fail with `usageError`, exit code 2, and a hint naming the flag or argument, as `profile add` does with `missing --auth-url`.

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
- Never print a stack trace, a raw response body, or an upstream error object. `src/index.ts` rethrows anything that isn't a known error, so wrap new error types there. Under `--json` it writes an `internal_error` document instead, with the message `Unexpected error in nipa. This is a bug.` and exit 1
- Give an error a `reason` when a script could act on it. Without one, exit 2 is `invalid_arguments` and anything else is `failed`

### Machine errors

With `--json`, a failure writes nothing to stdout and exactly one single-line JSON document to stderr, like the Vercel CLI's machine errors. The exit code stays the source of truth.

```json
{
  "message": "you aren't logged in to prod",
  "reason": "login_required",
  "status": "action_required",
  "hint": "Run `nipa login`.",
  "next": [{ "argv": ["nipa", "login"], "command": "nipa login" }]
}
```

- `status` is `action_required` for exit 2 and for `login_required` and `token_expired`: a person has to act before the command can run. Everything else is `error`
- `reason` is a stable snake_case code from the `Reason` union in `src/util/errors.ts`: `invalid_arguments`, `unknown_option`, `unknown_command`, `login_required`, `token_expired`, `not_found`, `ambiguous_name`, `network_error`, `api_error`, `invalid_config`, `internal_error` and `failed`. A reason is a contract: add one, never rename or reuse it, and never match the `message`, whose wording changes with the copy
- `message` and `hint` are the human error's text. `hint` appears only when the error has one
- `next` lists recovery commands as `{ command, argv }`, and appears only where a throw site sets `next` on its `CliError`: a missing or expired session, which names `nipa login`, and a name that matches nothing, which names the list command. Never derive `next` from hint text, because the backticks in a hint also hold `--yes` and config keys, and an agent must not add `--yes` on its own
- The document is a single line of `JSON.stringify` output written through `writeStderr`, which drops anything a terminal would act on, and it bypasses the styling helpers
- `next` keeps the run's `--profile`, because a bare command would use another profile
- `whoami --json` is the one exception to "a failure writes nothing to stdout": logged out, it prints its `{ "loggedIn": false, "profile": ... }` document to stdout, leaves stderr empty and returns 1, as `doctor --json` does for failing checks

### Remote boundary

Anything a server sends is untrusted: resource names, API error text, a release's `tag_name`. Keep it in bounds:

- Make every request through `request()` in `src/util/http.ts`. It refuses a redirect, because `fetch` re-sends the body and headers, such as `X-Auth-Token`, to the new host, and it gives up after 30 seconds unless the caller passes its own `signal`. Pass `redirect: "follow"` only for a call that carries no secret, as the update check does. Don't add retries
- Read a response body through `readText` in `http.ts`, a reader built on it, or a reader that catches its own failures, as `readError` and the update check do. A stall or a dropped connection while the body streams is then a `NetworkError`, and a body that isn't the expected JSON is a `KeystoneError` or `ApiError`, never a raw `TimeoutError` or `SyntaxError`
- Write every human message through `writeStderr` or the helpers on it, and never to `process.stderr` directly. `writeStderr` runs `printable()`, which removes control characters, escape sequences and format characters such as bidi overrides, and keeps newlines, combining marks and the SGR codes nipa's own color helpers write
- A remote value in a table or field cell can't carry an escape. `printTable`, `printFields` and `withDetail` print it on one line, with `\n`, `\r` and `\t` shown as text. Put a remote name in a cell when you can. A `paint` closure must use the `text` it's given, or a value that went through `oneLine`, because the table can't clean what a closure captured
- `createPrompts` cleans each prompt's message and choices, because inquirer writes to the stream itself
- A remote value inside a `log`, `note` or error message still passes `printable()`, which lets through the few color codes nipa writes. Quote it, and never build a line from remote text and a color code you chose for it
- Raw output is for `client.stdout` only, as `server logs` writes the console log. Filtering applies to human text on stderr, not to JSON or piped values

## Secrets

nipa handles passwords, OTP codes and Keystone tokens:

- Never print a password, an OTP code or a token, in any mode, including `--debug`. `src/util/http.ts` logs only the method, URL, status and time
- `nipa env` is the one command that prints the token, because its output is meant for `eval`. Keep it on stdout only
- Files under the config directory are written with mode `0600` in a directory with mode `0700`. Keep that for any new file
- Never put a token or password in a suggested command or a hint

## Compatibility

Treat these as contracts. Change them only with a migration, tests, and a changeset when users see it:

- Command names, aliases, flags and their short forms. The global flags are `--profile`, `--debug`, `--no-color`, `--non-interactive`, `--help` and `--version`
- Exit codes: 0 for success, 1 for a failure, 2 for a wrong command line, 127 when `os`, `tf` or `exec` can't find the program, 130 for Ctrl-C or a declined confirmation, and the child's code for passthrough commands
- Environment variables: `NIPA_PROFILE`, `NIPA_DEBUG`, `NIPA_CONFIG_DIR`, `NO_COLOR`, `FORCE_COLOR`, `CI` (no prompts, no update check), `NIPA_NO_UPDATE_CHECK`, `NO_UPDATE_NOTIFIER`, and the `OS_*` variables that `env`, `os`, `tf` and `exec` set
- The files in the config directory and their JSON shape
- `--json` field names and meanings. Add fields freely, but don't rename or remove them
- The error document under `--json`: one line on stderr with `status`, `reason`, `message`, and `hint` and `next` when they apply, an empty stdout, and the `reason` codes. Add codes and fields freely, but don't rename or remove them
- The bare values that piped stdout prints
- The completion scripts that `nipa completion <shell>` prints

Human output on stderr may change for clarity, as long as the tests change with it.

## Help

The help pages come from the specs in each `command.ts`:

- A `summary` is a sentence-case fragment without a final period that starts with a verb: `List the servers in your project`
- A `description` is full sentences. It says what the command does and anything surprising, such as `exec` removing stale `OS_*` variables
- Examples are real commands that run as written. Prefer a common workflow over a list of every flag
- `--help` exits 0. A group run without a subcommand runs its `default`

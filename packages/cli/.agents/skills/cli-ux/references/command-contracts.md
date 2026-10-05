# Command contracts

These contracts cover commands whose state machines need more than the general rules in [`core.md`](core.md). Add a contract here only when a command has an order of steps or a set of states that the general rules don't capture, and add a row for it to the table in `SKILL.md`.

Each contract lists the order nipa resolves things in, the rules, and the states to test.

## Login and sessions

`nipa login`, and any command that calls `client.session()` or `client.cloud()` without a live session, logs in through `interactiveLogin` in `src/util/session.ts`.

Resolution order:

1. **Profile**: `--profile`, then `NIPA_PROFILE`, then the current profile in the config file
2. **Email**: `--username`, then a prompt whose default is the last email for this profile
3. **Project ID**: `--project` when it's a 32-character ID, then the profile's last project, then a prompt. Nipa's gateway drops the connection for an unscoped token, so nipa needs a project ID before the first request
4. **Password**: always a masked prompt
5. **OTP code**: a prompt when Keystone answers that the account needs MFA
6. **Project by name**: when `--project` is a name, nipa logs in to the known project, lists the projects and switches to the named one

Rules:

- Login needs a terminal. Without one, `interactiveLogin` fails with a hint to run `nipa login` in a terminal first
- A command that needs a session prompts for login only when `client.prompts.interactive` is true. Without a terminal, it fails with `your <profile> session expired` or `you aren't logged in to <profile>`, and the hint names `loginLine(profile)`
- A wrong OTP code gets up to 3 attempts. After a wrong code, nipa says each code works once and asks for the next one
- A 401 from an API call means Keystone revoked the token. `guardSession` turns it into `your <profile> session expired or was revoked` with the login command as the hint
- Save the config and the session only after Keystone returns a scoped token
- `client.session()` runs once per command, so a command that calls it twice never logs in twice

States to test:

- Login in a terminal, with and without MFA
- A wrong OTP code, then a right one, and 3 wrong codes
- `--project` as an ID, as a name, and as a name nipa can't find
- A command that needs a session, with no session, with an expired one, and without a terminal
- A revoked token returning 401 from the Space API

## Switching projects and profiles

`nipa switch [project]` changes the project for the current profile, and `nipa profile use [name]` changes the current profile.

Rules:

- With an argument, use it. Without one, prompt with a choice list that marks the current entry and defaults to it
- Without an argument and without a terminal, fail with exit code 2 and a hint listing the names to pass
- Choosing the current project or profile is a no-op. Print a `note`, such as `You're already using my-project`, and exit 0
- `switch` with one project skips the prompt and uses it

## Running tools

`nipa os`, `nipa tf` and `nipa exec` run another program with the session's `OS_*` variables, through `runTool` in `src/util/tool.ts`.

Rules:

- Find the program before asking for a session, so a missing program never prompts for a password. A missing program exits with 127, and the hint says how to install `openstack` or `terraform`
- Remove every `OS_*` variable from the parent environment before adding the session's, so a stale `OS_PASSWORD` or `OS_CLOUD` from an old openrc can't win
- Pass every word after the command to the program untouched. nipa parses none of them, so `nipa os server list --help` shows the openstack help
- Inherit stdin, stdout and stderr, and print nothing of nipa's own after the program starts
- Exit with the program's exit code. When a signal ends it, exit with 128 plus the signal number
- Let the program handle Ctrl-C, so terraform can release its state lock, and exit after it does

States to test:

- The program is missing
- The program exits with 0 and with a nonzero code
- The parent environment has a stale `OS_PASSWORD`

## Printing the environment

`nipa env` prints the session's `OS_*` variables as shell commands for `eval`.

Rules:

- Write the whole result to stdout, in every mode, and nothing else to stdout
- Pick the syntax from `--shell`, then from `$SHELL`
- This is the one command that prints the token. Never echo it anywhere else

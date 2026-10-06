# Command contracts

These contracts cover commands whose state machines need more than the general rules in [`core.md`](core.md). Add a contract here only when a command has an order of steps or a set of states that the general rules don't capture, and add a row for it to the table in `SKILL.md`.

Each contract lists the order nipa resolves things in, the rules, and the states to test.

## Login and sessions

`nipa login`, and any command that calls `client.session()` or `client.cloud()` without a live session, logs in through `interactiveLogin` in `src/util/session.ts`.

Resolution order:

1. **Profile**: `--profile`, then `NIPA_PROFILE`, then the current profile in the config file
2. **Email**: `--username`, then a prompt whose default is the last email for this profile
3. **Project ID**: `--project` when it's a 32-character ID, then the profile's last project, then a prompt. Nipa's gateway drops the connection for an unscoped token, so nipa needs a project ID before the first request
4. **Password**: the one `nipa login --remember` saved in the OS keychain for this Keystone host and the `--username` or last user, then a masked prompt. With a saved password, nipa skips the email prompt too
5. **OTP code**: a prompt when Keystone answers that the account needs MFA
6. **Project by name**: when `--project` is a name, nipa logs in to the known project, lists the projects and switches to the named one

Rules:

- Login needs a terminal. Without one, `interactiveLogin` fails with a hint to run `nipa login` in a terminal first
- A command that needs a session prompts for login only when `client.prompts.interactive` is true. Without a terminal, it fails with `your <profile> session expired` or `you aren't logged in to <profile>`, and the hint names `loginLine(profile)`
- A wrong OTP code gets up to 3 attempts. After a wrong code, nipa says each code works once and asks for the next one
- A 401 from an API call means Keystone revoked the token. `guardSession` turns it into `your <profile> session expired or was revoked` with the login command as the hint
- Save the config and the session only after Keystone returns a scoped token. Save a `--remember` password only after Keystone accepts it
- `--remember` checks for a keychain after the terminal check and before any prompt. When Keystone refuses a saved password, delete it, log `The saved password didn't work, so nipa deleted it.`, and ask
- Never save the OTP code or its secret
- When a live session has less than 30 minutes left, `requireSession` prints a `note` with the login command. `nipa logout` and `nipa profile rm` delete the saved password
- `client.session()` runs once per command, so a command that calls it twice never logs in twice

States to test:

- Login in a terminal, with and without MFA
- A wrong OTP code, then a right one, and 3 wrong codes
- `--project` as an ID, as a name, and as a name nipa can't find
- A command that needs a session, with no session, with an expired one, and without a terminal
- A revoked token returning 401 from the Space API
- `--remember` saving, a saved password skipping the email and password prompts, and a refused saved password
- A session with less than 30 minutes left

## Switching projects and profiles

`nipa switch [project]` changes the project for the current profile, and `nipa profile use [name]` changes the current profile.

Rules:

- With an argument, use it. Without one, prompt with a choice list that marks the current entry and defaults to it
- Without an argument and without a terminal, fail with exit code 2 and a hint listing the names to pass
- Choosing the current project or profile is a no-op. Print a `note`, such as `You're already using my-project`, and exit 0
- `switch` with one project skips the prompt and uses it
- `switch` and `link` read the saved session through `client.savedSession()`, so a linked folder never hides the saved project. After `switch` in a linked folder, a `note` says the folder still uses its own project and names `nipa unlink`

## Linked folders

`nipa link [project]` writes `.nipa/project.json` with a profile and a project, like the Vercel CLI's `.vercel/project.json`. `findLink` in `src/util/link.ts` finds the closest one at or above the working folder.

Rules:

- The link's profile comes after `--profile` and `NIPA_PROFILE`, and before the current profile. The link's project applies only when the profile nipa picked is the link's
- In a linked folder, `client.session()` exchanges the saved token for one in the linked project, keeps it in memory, and logs `Using project my-project from .nipa/project.json` after the profile line. It never saves that token
- A link to a missing profile names the link file in the error. A broken link file names `nipa unlink` in the hint
- `link` without a project and without a terminal fails with exit code 2 and lists the projects, like `switch`. Linking a folder to its own project again is a no-op `note`
- `unlink` with no link is a no-op `note`, and exits 0

States to test:

- A command in the linked folder, in a folder below it, and outside it
- `-P` with another profile in a linked folder
- `whoami --json` with and without a link
- A missing profile and a broken link file

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

## Starting, stopping and restarting servers

`nipa server start`, `stop` and `restart` change a server's power state through the Space API, in `src/commands/server/power.ts`.

Resolution order:

1. **Flags**: a bad `--timeout`, or `--timeout` with `--no-wait`, fails with exit code 2 before nipa logs in or calls the API
2. **Server**: the argument, matched by ID first, then by name. No match, or a name that two servers share, fails before any change. The second error lists the IDs to pass instead
3. **No-op**: starting a running server or stopping a stopped one prints a `note`, such as `web-1 is already stopped`, and exits 0. Restarting a stopped server fails with a hint naming `nipa server start`
4. **Confirmation**: `stop` and `restart` ask `Stop server web-1 in my-project?`, which defaults to No. `--yes` skips it, and without a terminal they fail with exit code 2 and a hint naming `--yes`. `start` never asks
5. **Action**: one `POST` to the Space API, then a check of the server's state every 2 seconds until Nova reports the wanted status with no task left. With `--no-wait`, nipa stops after the `POST`, says it asked for the action, and names `nipa server inspect`

Rules:

- Name the project in the prompt and the success line, because the `prod` profile prints nothing else that names it
- Send nothing before the server, the no-op checks and the confirmation all pass
- Once the `POST` succeeds, the action can't be undone. An error from a later check keeps its message, and its hint says nipa already asked for the action and names `nipa server inspect`, so nobody sends it twice
- Stop waiting at `ERROR` or after `--timeout`, 5 minutes by default, and exit 1 with a hint naming `nipa server inspect`
- Print nothing to stdout. The success line on stderr is the result

States to test:

- A name, an ID, an unknown server, and a name two servers share
- Each no-op, and a restart of a stopped server
- `stop` and `restart` without `--yes` and without a terminal, with no `POST` sent
- A check that fails after the `POST` succeeds
- A refusal from Nova, such as stopping a server that's still building
- `--no-wait` sending one `POST` and no checks, and a bad `--timeout`

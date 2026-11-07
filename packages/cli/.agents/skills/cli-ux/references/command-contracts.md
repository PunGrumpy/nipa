# Command contracts

These contracts cover commands whose state machines need more than the general rules in [`core.md`](core.md). Add a contract here only when a command has an order of steps or a set of states that the general rules don't capture, and add a row for it to the table in `SKILL.md`.

Each contract lists the order nipa resolves things in, the rules, and the states to test.

## Login and sessions

`nipa login`, and any command that calls `client.session()` or `client.cloud()` without a live session, logs in through `interactiveLogin` in `src/util/session.ts`.

Resolution order:

1. **Profile**: `--profile`, then `NIPA_PROFILE`, then the current profile in the config file
2. **Email**: `--username`, then a prompt whose default is the last email for this profile
3. **Project ID**: the global `--project` when it's a 32-character ID, then the profile's last project, then a prompt. Nipa's gateway drops the connection for an unscoped token, so nipa needs a project ID before the first request
4. **Password**: the one `nipa login --remember` saved in the OS keychain for this Keystone host and the `--username` or last user, then a masked prompt. With a saved password, nipa skips the email prompt too
5. **OTP code**: a prompt when Keystone answers that the account needs MFA
6. **Project by name**: when `--project` is a name, nipa logs in to the known project, lists the projects and switches to the named one

Rules:

- Login needs to prompt. When `client.prompts.interactive` is false, `interactiveLogin` fails with `nipa can't prompt here` and a hint to run `nipa login` in a terminal without `--non-interactive` or `CI`
- A command that needs a session prompts for login only when `client.prompts.interactive` is true. When nipa can't prompt, it fails with `your <profile> session expired` or `you aren't logged in to <profile>`, and the hint names `loginLine(profile)`
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
- A command that needs a session, with no session, with an expired one, and when nipa can't prompt
- A revoked token returning 401 from the Space API
- `--remember` saving, a saved password skipping the email and password prompts, and a refused saved password
- A session with less than 30 minutes left

## Switching projects and profiles

`nipa switch [project]` changes the project for the current profile, and `nipa profile use [name]` changes the current profile.

Rules:

- With an argument, use it. Without one, prompt with a choice list that marks the current entry and defaults to it
- Without an argument and when nipa can't prompt, fail with exit code 2 and a hint listing the names to pass
- Choosing the current project or profile is a no-op. Print a `note`, such as `You're already using my-project`, and exit 0
- `switch` with one project skips the prompt and uses it
- `switch` and `link` read the saved session through `client.savedSession()`, so a linked folder or `--project` never hides the saved project. After `switch` in a linked folder, a `note` says the folder still uses its own project and names `nipa unlink`

## Choosing a project for one run

The global `-p, --project <name or ID>` picks the project for one run, so a person can look at another project without `nipa switch`. `requireSession` in `src/util/session.ts` treats it and a folder's link as the two sources of one per-run target.

Rules:

- The order is `--project`, then the folder's link, then the saved session's project. `--project` applies to whichever profile the run picked, and it is never saved: not to the session, not to the config, not to a link
- A 32-character ID is tried first with no project list, and a name costs one `listProjects` call. Keystone's token then names the project, so the context line reads `Using project Beta`, in the form of the linked case without a file path. A project that is already the session's prints no line and costs no exchange
- A name that matches nothing fails with exit code 1, `reason: "not_found"`, and the list of project names, and never falls back to another project. Not found is exit code 1 in the guideline's table, like an unknown server or profile. A name that two projects share fails with `ambiguous_name` and lists their IDs. An ID wins over a name
- When Keystone refuses to scope to a 32-character value, nipa lists the projects, because only the list can tell the cases apart: no project has it (`not_found`, with the list), a project is named like an ID (it uses that project), the project is listed but Keystone refuses it (`can't use project Beta`, exit code 1), or the session was revoked (the list answers 401, so `token_expired` with `nipa login`)
- A revoked session fails the same way for a name, because `listProjects` runs inside `guardSession`
- `login` keeps its meaning: `--project` names the project to scope the token to and save (`usesProject: "saves"` in its spec). A command that never reads a project sets `usesProject: false`, and dispatch refuses the flag with exit code 2, `--project doesn't apply to nipa switch` and the usage line, instead of ignoring it: `whoami`, `doctor`, `switch`, `link`, `unlink`, `logout` and `profile`. `switch` and `link` take the project as an argument and read the saved session, so `nipa -p Beta switch <project>` can't save a project by accident. `--help` and `--version` still work with the flag on the line
- On `os`, `tf` and `exec` the flag works only before the command, because the words after it belong to the program
- `nipa server search` is the one command that reads every project when `--project` isn't given. It uses the saved session, so a folder's link doesn't narrow it, and `-p` narrows it to one project (see Searching servers across projects)
- A command nipa suggests while `--project` is set repeats it, quoted for the shell (see Machine errors in `core.md`), so `nipa -p Beta server restart db-1` points to `nipa -p Beta server start db-1`. The profile's `-P` is repeated the same way

States to test:

- A name, an ID, the saved project, an unknown name, an unknown ID, a project named like an ID, a name two projects share and an ID that Keystone lists but refuses
- A revoked session, by name and by ID
- The flag before and after the command, and before `os`
- The flag on each command that refuses it, with the saved files unchanged
- Tab completion in each shell: `-p` offers project names, and the command after `-P x -p y` is still found
- The flag in a linked folder, with the link file and `auth.json` unchanged after the run
- `-P` with `-p`
- `--json`, where a failure writes one error document

## Linked folders

`nipa link [project]` writes `.nipa/project.json` with a profile and a project, like the Vercel CLI's `.vercel/project.json`. `findLink` in `src/util/link.ts` finds the closest one at or above the working folder.

Rules:

- The link's profile comes after `--profile` and `NIPA_PROFILE`, and before the current profile. The link's project applies only when the profile nipa picked is the link's
- In a linked folder, `client.session()` exchanges the saved token for one in the linked project, keeps it in memory, and logs `Using project my-project from .nipa/project.json` after the profile line. It never saves that token. `--project` beats the link
- A link to a missing profile names the link file in the error. A broken link file names `nipa unlink` in the hint
- `link` without a project and when nipa can't prompt fails with exit code 2 and lists the projects, like `switch`. Linking a folder to its own project again is a no-op `note`
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
4. **Confirmation**: `stop` and `restart` ask `Stop server web-1 in my-project?`, which defaults to No. `--yes` skips it, and when nipa can't prompt they fail with exit code 2 and a hint naming `--yes`. `start` never asks
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
- `stop` and `restart` without `--yes` and when nipa can't prompt, with no `POST` sent
- A check that fails after the `POST` succeeds
- A refusal from Nova, such as stopping a server that's still building
- `--no-wait` sending one `POST` and no checks, and a bad `--timeout`

## Searching servers across projects

`nipa server search [query]` in `src/commands/server/search.ts` looks for servers in every project the account can use, live. It keeps no catalog or cache: a stored index goes stale when the portal, Terraform or Kubernetes change a server, needs a live token to refresh, and would write every server's name, ID and address to disk. Reopen that only with a measured search that takes over about 3 seconds, which the elapsed tag on the first line reports.

Resolution order:

1. **Query**: a case-insensitive piece of a server's name, ID or any address, as plain text and never a pattern. No query, or an empty one, matches every server
2. **Profile and session**: the run's profile, then the saved session through `client.savedSession()`, so a folder's link never narrows the search. The Space API URL is checked before anything asks for a login
3. **Projects**: with `-p`, that one project, through `client.cloud()` and with no fan-out. Without it, every project `listProjects` returns, sorted by name and then ID
4. **Search**: for each project, one token exchange (none for the saved project) and one server list, four projects at a time, with 15 seconds for each from the moment its own search starts. The limit and the deadline are constants with no flag
5. **Output**: a pure render of `{ project, servers } | { project, failure }` for each project

Rules:

- Read-only: the command writes nothing to the config directory, and sends the same requests every time
- A project that fails, is refused or stalls is a result of its own and never stops the others. Partial results follow [Part of a result](core.md#part-of-a-result): exit 1, the rows and the `--json` document still printed, and no error document. A failure that nipa doesn't expect is a bug and is thrown again
- A name that a project gives to more than one server has each server's ID under it, whether or not the others match, because a name can't pick one of them. A single match with such a name is inspected by ID
- `(current)` marks the project a bare command in this folder would use: the folder's link when it names the run's profile, else the saved project. The link is only read to mark it, so it still never narrows the search
- A command it suggests names the project of the match with `-p` after `nipa`, built with `suggest()` and the project overridden in the scope, so the run's `-P` stays and a name with a space is quoted. A project or server whose name has a line break is named by its ID, because the name can't be copied back. A project that shares its name with another is named by its ID, and in a terminal its heading shows that ID, dimmed, after the name. Under `-p`, the run's own `-p` stays
- Cells and lines made of remote text print on one line, and a column is never cut. In a terminal too narrow for a row, each server takes two lines, the way `server ls` does
- In a pipe, stdout is the table (`ID Name Project Project ID Status Address Flavor Created`, or the header alone), and the `Project ID` column is always there so a script can tell two projects of one name apart and stderr is the context line and, after a partial failure, the error. Terminal hints don't print there

States to test:

- A terminal at 80 columns and at a narrow width, a pipe, `--json`, no matches, no query, a single match and several
- A name that repeats in one project, with a match on only one of them
- A project that returns 403, one that Keystone refuses, one that never answers, and every project failing with an expired session
- `-p`, `-P` and both, with the suggested commands checked for each
- A folder link, with the link file and `auth.json` unchanged
- At most four projects open at once, and one stalled project not holding the others past its deadline

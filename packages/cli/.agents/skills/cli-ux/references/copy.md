# CLI copywriting

These rules cover the words nipa prints. Load [`core.md`](core.md) with this page, because a better string can't fix a prompt in the wrong place or a result on the wrong stream.

## Triage

Check substance before punctuation:

1. Name the surface: help, prompt, spinner, success, note, error, hint, empty list, or next step
2. Name the exact object, such as the profile, project or server, and the consequence
3. Cut facts already visible in the command line, a prompt answer, or the line above
4. Give the fix when one exists, as an exact command
5. Keep one noun and one verb per concept across help, prompts, output, errors and tests
6. Check case, punctuation, backticks, ellipses, numbers and plurals

Review every string the command prints, not only the line you edited.

## Voice

Write like a teammate who knows OpenStack: clear, direct and calm.

| Surface | Tone            | Example                                     |
| ------- | --------------- | ------------------------------------------- |
| Success | Brief           | `> Success! Switched to my-project [1s]`    |
| Error   | Direct, helpful | `Error: your prod session expired`          |
| Hint    | One exact fix   | ``> Run `nipa login`.``                     |
| Spinner | Factual         | `Loading your projects…`                    |
| Note    | Neutral         | `> NOTE: You're already using my-project`   |
| Prompt  | Specific        | `Remove profile staging and log out of it?` |

Don't write hype, jokes, apologies or celebration. Routine work doesn't need an exclamation mark. `Success!` is the one exception, because the `success` helper prints it.

## Words

Use nipa's nouns:

- **profile**: a named Keystone endpoint with its region and user domain. `prod` is the built-in one
- **session**: the saved token for a profile
- **project**: the OpenStack project the token is scoped to. Don't call it a tenant
- **server**: a compute instance. Don't call it a VM or instance in nipa's own output
- **OTP code**: the 6-digit code from the authenticator app. Don't call it a TOTP, MFA token or passcode in prompts
- **Keystone URL**: the identity endpoint. Use `--auth-url` only when naming the flag

Use these verbs:

- **log in** and **log out** as verbs, `login` only as the command name
- **add** and **remove** for profiles, matching `profile add` and `profile rm`
- **switch** for changing the project, **use** for changing the profile

Cut these words:

- filler: `just`, `simply`, `actually`, `really`, `very`, `in order to`, `please`
- hype: `seamlessly`, `easily`, `powerful`, `blazing`
- vague failures: `Unable to`, `An error occurred`, `Something went wrong`, `failed successfully`
- `successfully`, because the `success` helper already says it
- `Do you want to…` and `Would you like to…` in prompts

## Mechanics

Format each string by its surface:

- Error messages are lowercase fragments without a final period: `can't remove prod`
- Hints, notes and `log` lines that are full sentences end with a period. Fragments, labels and success lines don't
- Summaries in help are sentence-case fragments without a final period. Descriptions are full sentences
- Put commands, flags, file names and environment variables in backticks inside hints and notes: ``Add `--yes` to remove it without asking.``
- Quote values the person typed with straight double quotes in errors: `no profile named "staging"`
- Use `…`, never `...`, in spinners and prose. Keep `...` only in usage syntax such as `<args...>`
- Use numerals and match the plural to the count: `1 profile`, `2 profiles`. Never write `profile(s)`
- Write durations in compact form: `850ms`, `3s`, `45m`, `2h 10m`, `3d`
- Use contractions: `can't`, `you're`, `isn't`

## Surfaces

Help:

- Start a summary with the verb and the object: `Run terraform with the session`
- Don't start with `Allows you to`, `Used to` or `This command`
- Name placeholders after the value: `<name>`, `<project>`, `<shell>`

Prompts:

- Label a text prompt with the noun it wants: `Profile name`, `Keystone URL`, `OTP code`
- End a choice prompt with a colon: `Switch to:`, `Use profile:`
- Make a yes/no prompt name the action and the object, so the answer is unambiguous out of context

Success and next steps:

- Use a past-tense verb and the object: `Logged out of staging`, `Added profile staging (Keystone v3.14)`
- Put the next command in a `log` line after the success line, as a full sentence

Errors and hints:

- Say what failed in the message and how to fix it in the hint. Don't repeat the message in the hint
- Blame nothing: write `no project named or with ID "x"`, not `you typed an invalid project`
- When nipa can't prompt, the hint names the flag or argument to pass instead

## Scope

Don't rewrite these for style:

- JSON field names, exit codes, environment variables, file names and file contents
- Commands, flags, paths and values the person typed
- Messages from `openstack`, `terraform` or another program that `os`, `tf` or `exec` runs
- Test strings, unless they assert shipped copy that you're changing

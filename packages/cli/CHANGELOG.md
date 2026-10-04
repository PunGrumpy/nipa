# nipa-cli

## 0.1.1

### Patch Changes

- 004f686: Install nipa from npm with `npm install -g nipa-cli`. The package runs on Node.js 22.13 or later, and the binaries on GitHub releases still need nothing else installed.

## 0.1.0

### Minor Changes

- 93c35d9: `nipa profile rm --help` and every other subcommand print their own help page, and `nipa server --json` runs `nipa server ls --json`. Usage errors name the command and show its usage line, and an extra argument, as in `nipa switch Beta extra`, exits with code 2.
- 268f3ff: Add `--debug`, or `NIPA_DEBUG=1`, to log the method, URL, status and time of each HTTP request.
- ab32643: First release: `nipa login` with a password and OTP code, `logout`, `whoami`, `switch`, `env`, `exec`, `os`, `tf` and `completion` for bash, zsh, fish and PowerShell.
- 268f3ff: `nipa login` sends your password first and asks for an OTP code only when Keystone asks for one. After a wrong code, it asks for the next one, up to 3 times, without asking for the password again.
- 268f3ff: Add `nipa profile` to keep a session for more than one Keystone, such as staging, and `-P <name>` or `NIPA_PROFILE` to pick one for a command. Files from nipa 0.1 load as the `prod` profile.
- 503fa77: Add `nipa server ls` to list the servers in your project with their status, address and flavor, without the OpenStack client.
- 268f3ff: `nipa` checks GitHub for a newer release at most once a day and prints a notice when there is one. Set `NIPA_NO_UPDATE_CHECK` to turn it off.
- 268f3ff: `nipa` shows its prompts, spinners and results in the Vercel CLI style, groups `nipa --help` by task, and completes global options and the `nipa profile` subcommands in every shell.

### Patch Changes

- 268f3ff: nipa stops reading its own options at `--`. In `nipa switch -- -h`, the command gets `-h` and nipa doesn't print its help.
- 268f3ff: Tab completion after `nipa os` lists openstack's commands and options in bash, zsh, fish and PowerShell. The OpenStack client ships completion only for bash, so `nipa os` used to complete file names in the other shells.
- 503fa77: nipa's `>` messages, such as `> Logging in to prod`, no longer print in red in a terminal.
- 268f3ff: A mistyped command name gets a suggestion, such as "Did you mean `nipa login`?".

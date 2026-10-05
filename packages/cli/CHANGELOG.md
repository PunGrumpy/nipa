# nipa-cli

## 0.1.5

### Patch Changes

- 197c333: Add `nipa completion --install`, which saves the tab completion script where bash, zsh or fish loads it, so the shell doesn't run nipa each time it starts. nipa rewrites the saved script when its version changes, so new commands complete after an update. `nipa completion` without a shell uses the one in `$SHELL`.
- 47797cd: `nipa server ls` marks the servers that a Kubernetes cluster made, such as `k8s-control-plane-1 (Kubernetes master)`, from the Magnum tags the portal reads too. `--json` gives each server `kubernetes`, which is `null` for a server you made, or the cluster's `clusterId` and the node's `role`. The troubleshooting page explains why `nipa os coe` and other commands can't find their service on production.
- 587c9ac: Give production's Space API only to profiles on production's Keystone. In 0.1.4, a staging profile got production's Space API, which refused its token, so `nipa server ls` said the session had expired. nipa now drops that URL from such profiles. `nipa profile add --space-url` takes the Space portal URL, such as `https://portal-stg-epc.nipa.cloud`, saves its `/api`, and checks that it answers. With another Keystone and a terminal, `profile add` asks for the portal URL. Without one, `server ls`, `db ls`, `lb ls` and `ip ls` say the profile has no Space API URL before they ask for a login. A profile that 0.1.4 saved with a portal URL gets its `/api` when nipa loads it, and a Space API URL that answers with a web page gets an error that says so.

## 0.1.4

### Patch Changes

- 3adea28: Add `nipa db ls`, which lists the managed database clusters in your project with their engine, status, address, flavor and age. `nipa server ls` doesn't show them.
- 3adea28: Add `nipa ip ls`, which lists the external IPs in your project with their status, the internal IP each one forwards to, zone and name. An IP without an internal IP isn't attached to anything.
- 3adea28: Add `nipa lb ls`, which lists the load balancers in your project with their status, health, virtual IP, listener count and age.
- 49a0027: `nipa server ls` calls Nipa Cloud's Space API at `https://space.nipa.cloud/api` on port 443, instead of the compute endpoint in Keystone's catalog on port 8774, which many networks can't reach. A profile keeps its Space API URL in `spaceUrl`, and `nipa profile add --space-url` sets it. `nipa server ls --json` no longer has `network` on each address, because the Space API doesn't name it. nipa no longer reads Keystone's catalog or saves its endpoints in `auth.json`.

## 0.1.3

### Patch Changes

- 6d2d00f: `nipa login` and `nipa switch` get a token on Nipa Cloud again. Nipa's gateway drops the connection for a token without a service catalog, so nipa now asks for your project ID on a first login, takes it from `--project`, or uses the project from your last login.

## 0.1.2

### Patch Changes

- 15f0ce5: `nipa login` asks for your OTP code on Nipa Cloud again. Nipa's gateway sends 401 responses with an empty body, so nipa couldn't read the account's MFA rules and printed an empty `Error:` instead.

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

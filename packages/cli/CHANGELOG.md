# nipa-cli

## 0.1.6

### Patch Changes

- 22d34a3: Add `nipa db inspect`, which takes a database cluster's name or ID and answers whether it's healthy and how to reach it. It shows the engine and version, status, health and when Trove last checked it, flavor with its vCPUs and RAM, storage, zone, address with the engine's default port, allowed CIDRs, replicas, whether the general and slow query logs are on, and the 5 newest backups. Its last line says the database is healthy and where to connect, or what needs attention, such as a primary that isn't active or a latest backup that failed. `--json` prints all of it under `database`, with every backup, the engine's `defaultPort` and a `problems` list of what's wrong and where. `nipa db ls --json` gives each primary `id`, `zone`, `vcpus`, `ramMb`, `allowedCidrs` and `healthCheckedAt` too, and every status list colors completed backups green and failed ones red.
- 22d34a3: `nipa db ls` shows a database's internal address when it has no external IP. The Address column was blank for these, and `--json` gave `externalAddress` as `""` instead of `null`.
- f31bf3b: Add `nipa doctor`, which checks your setup in one go and says what to fix: the config files, which profile the run uses and why, whether its Keystone and Space API answer and how fast, the session and when it expires, whether Keystone and the Space API accept its token, the folder's link, `openstack` and `terraform`, and a newer nipa from the last update check. It changes nothing and never asks for a password, so it works in scripts. `--json` prints each check's `id`, `status`, `summary` and `hint`. It exits with code 1 when a check fails, and a warning doesn't change the exit code.
- 49bc449: Add `nipa flavor ls`, which lists the flavors a server can have, smallest first, with their vCPUs, RAM and type. The Space portal calls them machine types, so `nipa machine-types` does the same, and so does `nipa flavors`. The ones only database clusters use don't show. In a pipe, it prints one flavor name per line.
- 49bc449: Add `nipa k8s ls`, which lists the Kubernetes clusters in your project with their Kubernetes version, nodes, active node count and age. `nipa os coe` can't find Magnum on Nipa Cloud production, so nipa finds each cluster through the servers Magnum made for it. `nipa kubernetes` and `nipa coe` do the same. `nipa server ls --json` gives each Kubernetes node its `version` too.
- 61c0eed: Add `nipa lb inspect`, which takes a load balancer's name or ID and shows why it doesn't serve. It prints the load balancer's status, health, virtual IP, external IP and flavor, then each listener, backend group and member with its status and health, and marks in red each part that isn't `ACTIVE` and `ONLINE`. The last line names what stops it, such as `2 of 3 members are down`, or says that every part is healthy. `--json` prints the whole load balancer with its listeners, backend groups and members. Tab completes load balancer names after `nipa lb inspect`.
- 49bc449: Add `nipa network ls`, which lists the networks your project can use with their status, type, zone and age. A VPC network is one of your project's private networks, and an external network is a shared pool of external IPs. `nipa networks` does the same.
- 3c4252d: Add `nipa link [project]`, like the Vercel CLI's `vercel link`, which saves the profile and a project in `.nipa/project.json`. Commands in that folder and the folders below it use them, so a Terraform folder for staging needs no `-P staging`, and `nipa switch` in other folders doesn't change it. nipa exchanges the token for the linked project before each command and doesn't save it. `nipa unlink` removes the link, and `nipa whoami --json` gives `link`.
- 51f4c90: Add `nipa open`, which opens the profile's Space portal in your browser, like `vercel open`. `nipa open server`, `volume`, `network`, `sg`, `lb` or `db` opens that list, and a name or ID after it opens that resource's page. In a pipe, or with `--url`, nipa prints only the URL and doesn't open a browser. The portal opens the project you last used in it, because a URL can't pick one.
- 92bda92: Tab completion after `nipa os` completes server names after `server show`, `stop`, `start`, `delete` and the other commands that take only servers, and the names after `--flavor`, `--image` and `--network`. nipa reads them from the Space API, keeps them for a minute, and never asks for a password on a Tab press.
- 0cb45a4: Add `nipa quota ls`, which shows each quota of your project, such as servers, vCPUs, RAM and volumes, by group, with how much it uses, its limit and the percent used. A quota at 80% or more shows in yellow and one at its limit in red, and a note counts them, so you can see why a create failed or how much room is left. `--json` prints each quota's group, name, used, limit and unit, and a pipe gets one tab-separated line per quota with its unit. `nipa quota`, `nipa quotas` and `nipa limits` do the same.
- fe436ef: Add `nipa login --remember`, which saves your password in the macOS Keychain, or with `secret-tool` on Linux, so later logins ask only for an OTP code. Keystone has no refresh token, so a session still lasts 24 hours. When Keystone refuses a saved password, nipa deletes it and asks. `nipa logout` and `nipa profile rm` delete the saved password. Commands that use a session with less than 30 minutes left print a note with the login command first.
- 9df4221: Add `nipa server history` and `nipa server logs` to find out why a server failed. `history`, or `events`, lists the actions on a server, newest first, with who asked, the result and the request ID. `logs` prints the server's console log, cloud-init output included, and `--tail 20` keeps the last 20 lines. A server that never booted has no console log, so nipa says so and names `nipa server history`. `nipa server inspect` now shows Nova's task while the server is busy, whether it's locked, and its last action, such as `create failed 26m ago by Ann`, and names `history` and `logs` for a server in Error. `--json` prints all of it, and `inspect --json` adds `taskState`, `locked` and `lastAction` to the server.
- 9afaa9b: Add `nipa server inspect`, `start`, `stop` and `restart`, which take a server's name or ID. `inspect` shows the server's flavor with its vCPUs and RAM, zone, addresses, volumes and security groups, and `--json` prints them. `start`, `stop` and `restart` call the Space API, like the Space portal's buttons, then wait until the server finishes. `stop` and `restart` ask first, and `--yes` skips the question. `--no-wait` returns once the Space API takes the action, and `--timeout 10m` waits longer than the default 5 minutes. Tab completes server names after these commands. `nipa server ls --json` gives each server `vcpus`, `ramMb`, `zone`, `volumes` and `securityGroups` too.
- 340528d: `nipa sg inspect <Tab>` completes security group names.
- 340528d: Add `nipa sg inspect`, which takes a security group's name or ID and shows its description, the servers that use it with their addresses, and its inbound and outbound rules. Each rule shows its protocol, ports, and the CIDR or security group it allows by name. A note says when an inbound rule opens SSH, RDP or a database port to the internet. `--json` prints the group in the shape `nipa sg ls --json` uses, and adds each rule's `remoteGroupName` and the group's `servers`.
- 49bc449: Add `nipa sg ls`, which lists the security groups in your project with their inbound and outbound rule counts, age and description. `--json` prints each rule's direction, protocol, ports and remote. `nipa security-group` and `nipa security-groups` do the same.
- 49bc449: Add `nipa volume ls`, which lists the block storage volumes in your project with their status, size, type, the server each one is attached to, and age. `nipa volumes` does the same. Volume statuses such as `in-use` and `creating` get the same colors as server statuses, and read as "In use" and "Creating".

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

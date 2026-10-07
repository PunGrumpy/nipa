<!-- contentType: Reference · plan: docs/content-plan.md -->

# CLI reference

This page lists the commands, options, environment variables, files, exit codes and JSON output of `nipa`. It matches the code in `packages/cli/src/` and the output of `nipa <command> --help`.

## Commands

nipa has 14 commands. Without a command, it prints help.

| Command | What it does |
| --- | --- |
| `nipa login [options]` | Asks for your email and password, then for a one-time password (OTP) code when your account uses multi-factor authentication (MFA). Saves a token scoped to a project. With `--remember`, saves your password in the OS keychain, so later logins ask only for an OTP code |
| `nipa logout` | Revokes the current profile's token, deletes its session, and deletes a password that `--remember` saved |
| `nipa whoami [--json]` | Shows your user, profile, project and when the session expires |
| `nipa switch [project]` | Scopes the session to another project by name or ID, without a password or OTP code. In a linked folder, it changes the saved project, and the folder keeps its own |
| `nipa link [project]` | Links this folder to the profile and a project, by name or ID, in `.nipa/project.json`. Commands in this folder and the folders below it use them |
| `nipa unlink` | Deletes the closest `.nipa/project.json`, at or above this folder |
| `nipa server ls [--json]` | Lists the servers in your project with their status, address, flavor and age. A server that a Kubernetes cluster made shows its role after its name, such as `(Kubernetes master)`. In a pipe, it prints one server ID per line. `nipa server`, `nipa servers` and `nipa server list` do the same |
| `nipa server inspect <server> [--json]` | Shows one server's ID, status, flavor with its vCPUs and RAM, zone, addresses, volumes, security groups and age, by name or ID. In a pipe, it prints the server's ID |
| `nipa server start <server> [options]` | Starts a stopped server, then waits until it's active |
| `nipa server stop <server> [options]` | Stops a server after you confirm, then waits until it's shut off |
| `nipa server restart <server> [options]` | Restarts a running server after you confirm, then waits until it's active again. `nipa server reboot` is the same command |
| `nipa k8s ls [--json]` | Lists the Kubernetes clusters in your project with their Kubernetes version, nodes, active node count and age. The Space API has no Kubernetes endpoint, so nipa finds each cluster through the servers Magnum made for it, and a cluster without servers doesn't show. In a pipe, it prints one cluster ID per line. `nipa k8s`, `nipa kubernetes` and `nipa coe` do the same |
| `nipa db ls [--json]` | Lists the database clusters in your project with their engine, status, address, flavor and age. The address is the primary's external IP, or its internal IP without one. In a pipe, it prints one cluster ID per line. `nipa db`, `nipa database` and `nipa databases` do the same |
| `nipa lb ls [--json]` | Lists the load balancers in your project with their status, health, virtual IP, listener count and age. In a pipe, it prints one load balancer ID per line. `nipa lb`, `nipa loadbalancer` and `nipa loadbalancers` do the same |
| `nipa ip ls [--json]` | Lists the external IPs in your project with their status, the internal IP each one forwards to, zone and name. An IP without an internal IP isn't attached to anything. In a pipe, it prints one address per line. `nipa ip` and `nipa ips` do the same |
| `nipa os <args...>` | Runs `openstack <args...>` with the session. `nipa openstack` is the same command |
| `nipa tf <args...>` | Runs `terraform <args...>` with the session. `nipa terraform` is the same command |
| `nipa exec <command> [args...]` | Runs any command with the session |
| `nipa env [--shell bash\|zsh\|fish]` | Prints the session's `OS_*` variables as shell commands |
| `nipa profile [ls\|add\|use\|rm]` | Lists, adds, picks or removes profiles |
| `nipa completion [shell] [--install]` | Prints the tab completion script for `bash`, `zsh`, `fish` or `pwsh`. Without a shell, nipa uses the one in `$SHELL`. With `--install`, nipa saves the script where the shell loads it instead of printing it: `~/.zfunc/_nipa` for zsh, `~/.local/share/bash-completion/completions/nipa` for bash and `~/.config/fish/completions/nipa.fish` for fish. PowerShell has no such folder |

`nipa help <command>` and `nipa <command> --help` print the help for one command. `nipa help profile rm` and `nipa profile rm --help` print the help for one subcommand. A command with subcommands runs its default subcommand when you name none, so `nipa server --json` runs `nipa server ls --json`. A mistyped command name gets a suggestion, such as "Did you mean `nipa login`?".

`nipa server start`, `stop` and `restart` wait up to 5 minutes for the server to finish, or as long as `--timeout` says. They exit with code `1` when the server goes into an error state or is still busy after that. With `--no-wait`, they return once the Space API takes the action, and `nipa server inspect` shows when the server finishes. Starting a running server or stopping a stopped one prints a note and exits with code `0`.

## Command options

These options belong to one command:

| Option | Command | What it does |
| --- | --- | --- |
| `-u, --username <email>` | `login` | Logs in as this user instead of the last one |
| `-p, --project <project>` | `login` | Scopes the token to this project, by name or ID, instead of the last one |
| `--remember` | `login` | Saves your password in the macOS Keychain, or with `secret-tool` on Linux, after Keystone accepts it. Later logins as that user skip the email and password questions. When Keystone refuses a saved password, nipa deletes it and asks |
| `--json` | `whoami`, `profile ls`, `server ls`, `server inspect`, `k8s ls`, `db ls`, `lb ls`, `ip ls` | Prints JSON on stdout |
| `--shell <bash\|zsh\|fish>` | `env` | Picks the shell syntax. The default comes from `$SHELL` |
| `--auth-url <url>` | `profile add` | The Keystone URL, ending in `/v3` |
| `--user-domain <domain>` | `profile add` | The user domain. The default is `nipacloud` |
| `--region <region>` | `profile add` | The region. The default is `NCP-TH` |
| `--space-url <url>` | `profile add` | The Space portal URL, such as `https://space.nipa.cloud`, or its API URL. nipa saves the API under the portal's `/api` and checks that it answers. A profile on production's Keystone gets `https://space.nipa.cloud/api` without it. With another Keystone, nipa asks for it in a terminal, and Enter skips it |
| `--use` | `profile add` | Makes the new profile the current one |
| `--install` | `completion` | Saves the script where the shell loads it, instead of printing it |
| `-y, --yes` | `profile rm`, `server stop`, `server restart` | Skips the confirmation. Without a terminal, these commands need it |
| `--no-wait` | `server start`, `server stop`, `server restart` | Returns once the Space API takes the action, without waiting for the server |
| `--timeout <duration>` | `server start`, `server stop`, `server restart` | How long to wait for the server, as a number and `s`, `m` or `h`, such as `90s` or `10m`. The default is `5m`. It can't go with `--no-wait` |

## Global options

Global options work with every command. Put them before `os`, `tf` and `exec`, because nipa passes every word after those commands to the program they run, `--help` included.

| Option | Variable | What it does |
| --- | --- | --- |
| `-P, --profile <name>` | `NIPA_PROFILE` | Uses this profile instead of the current one |
| `-d, --debug` | `NIPA_DEBUG=1` | Logs each HTTP request: method, URL, status and time. Never headers or bodies |
| `--no-color` | `NO_COLOR=1` | Turns off colors |
| `-h, --help` |  | Prints help |
| `-v, --version` |  | Prints the version |

nipa picks the profile in this order: `--profile`, then `NIPA_PROFILE`, then the profile in the closest `.nipa/project.json` at or above the folder you run it in, then `currentProfile` in `config.json`. When the link names the profile nipa picked, nipa exchanges the saved token for one in the linked project before each command, without saving it, and prints `> Using project my-project from .nipa/project.json`.

## Other environment variables

These variables change where nipa keeps files and when it checks for updates:

| Variable | What it does |
| --- | --- |
| `NIPA_CONFIG_DIR` | The directory for `config.json` and `auth.json`. The default is `$XDG_CONFIG_HOME/nipa`, then `~/.config/nipa` |
| `XDG_CACHE_HOME` | The parent of `nipa/update.json` and `nipa/openstack.json`. The default is `~/.cache` |
| `NIPA_NO_UPDATE_CHECK` | Turns off the update check when set to any value |
| `CI` | Turns off the update check when set to any value |

## Files

nipa keeps these files. It writes `config.json` and `auth.json` with mode `0600` in a `0700` directory:

| File | Contents |
| --- | --- |
| `config.json` | `currentProfile`, and `profiles` with each profile's `authUrl`, `userDomain`, `region`, `spaceUrl`, last `username` and last `project` |
| `auth.json` | `sessions` with each profile's token, expiry time, user and project |
| macOS Keychain or Linux secret service | With `--remember`, your password, under the service `nipa-cli/<Keystone host>` and your email. `nipa logout` and `nipa profile rm` delete it |
| `.nipa/project.json` | In a folder that `nipa link` linked: the `profile`, and the `project` with its `id`, `name` and `domainId`. It holds no token, so you can commit it to share the link with your team, or add `.nipa` to `.gitignore` |
| `~/.cache/nipa/update.json` | The latest version on GitHub and when nipa checked |
| `~/.cache/nipa/openstack.json` | openstack's commands and options, for tab completion after `nipa os` |
| `~/.cache/nipa/names.json` | Server, flavor, image and network names from the Space API, for tab completion, kept for a minute per profile and project |
| `~/.cache/nipa/completion.json` | Where `nipa completion --install` saved each script, and the nipa version that wrote it. When the version changes, the next command rewrites the script |

nipa 0.1 kept one profile's fields and one session at the top level of these files. nipa reads that format as the `prod` profile and writes the new format the next time it saves.

`prod` is always there. Its defaults are `https://identity-api.nipa.cloud/v3`, user domain `nipacloud`, region `NCP-TH` and Space API `https://space.nipa.cloud/api`. A profile on production's Keystone without `spaceUrl` uses that Space API. A profile on another Keystone without `spaceUrl` has none, so `server ls`, `k8s ls`, `db ls`, `lb ls` and `ip ls` don't work with it. nipa 0.1.4 gave every new profile production's Space API, which takes only production's tokens, so nipa drops it from profiles on another Keystone.

## Exit codes

nipa exits with these codes:

| Code | Meaning |
| --- | --- |
| `0` | The command worked |
| `1` | An error, such as a wrong password or an expired session |
| `2` | A usage error: an unknown command or option, a missing value or argument, or an extra argument |
| `127` | `nipa exec` couldn't find the command |
| `130` | You pressed Ctrl+C at a prompt, or answered No to a confirmation |

`nipa os`, `nipa tf` and `nipa exec` exit with the code of the program they ran. When a signal stops that program, the code is 128 plus the signal number.

## JSON output

`nipa whoami --json` prints this object on stdout:

```json
{
  "authUrl": "https://identity-api.nipa.cloud/v3",
  "expiresAt": "2030-01-01T00:00:00.000000Z",
  "loggedIn": true,
  "profile": "prod",
  "project": { "domainId": "1234…", "id": "5678…", "name": "my-project" },
  "link": null,
  "region": "NCP-TH",
  "user": { "id": "9012…", "name": "me@example.com" }
}
```

`project` is the saved session's project. In a linked folder, `link` has the link file's path in `file`, and the `project` that commands there use.

Without a session, it prints `{"loggedIn":false,"profile":"prod"}` and exits with code `1`.

`nipa server ls --json` prints the profile, the project and its servers, newest first. `status` is the server's OpenStack status, such as `ACTIVE` or `SHUTOFF`, and an address's `type` is `fixed` for an internal IP or `floating` for an external one. `kubernetes` is `null` for a server you made. For a Kubernetes node, it has the Magnum cluster's `clusterId`, the node's `role`, such as `master`, and the Kubernetes `version` of its image, such as `1.34.9`. `role` and `version` are `null` when the server doesn't have them:

```json
{
  "profile": "prod",
  "project": { "domainId": "1234…", "id": "5678…", "name": "my-project" },
  "servers": [
    {
      "addresses": [
        {
          "address": "192.0.2.5",
          "type": "fixed",
          "version": 4
        }
      ],
      "createdAt": "2030-01-01T00:00:00Z",
      "flavor": "csa.large.v2",
      "id": "9abc…",
      "kubernetes": null,
      "name": "web-1",
      "ramMb": 4096,
      "securityGroups": ["default"],
      "status": "ACTIVE",
      "vcpus": 2,
      "volumes": [
        {
          "attachedAs": "boot disk",
          "id": "def0…",
          "name": "web-1-vol-0",
          "sizeGb": 10,
          "type": "Standard_SSD"
        }
      ],
      "zone": "NCP-BKK"
    }
  ]
}
```

`ramMb`, `vcpus`, `zone`, `attachedAs`, a volume's `name` and its `type` are `null` when the Space API doesn't send them. `nipa server inspect --json` prints the same fields for one server, under `server` instead of `servers`.

`nipa k8s ls --json` prints the profile, the project and its Kubernetes clusters, newest first. `id` is the Magnum cluster's ID, `createdAt` is when its oldest node was made, and `nodes` lists masters first, then by name. A node's `status` is the server's status, such as `ACTIVE` or `ERROR`:

```json
{
  "clusters": [
    {
      "createdAt": "2030-01-01T00:00:00Z",
      "id": "dddd…",
      "nodes": [
        {
          "id": "4444…",
          "name": "k8s-control-plane-1",
          "role": "master",
          "status": "ACTIVE"
        }
      ],
      "version": "1.34.9"
    }
  ],
  "profile": "prod",
  "project": { "domainId": "1234…", "id": "5678…", "name": "my-project" }
}
```

`nipa db ls --json` prints the profile, the project and its database clusters, newest first. `primary` is the instance that takes writes, or `null` while the cluster is being created. Its `status` is the instance's status, such as `ACTIVE` or `BUILD`, `health` is `HEALTHY` when the database answers, and `externalAddress` is `null` without an external IP:

```json
{
  "databases": [
    {
      "createdAt": "2030-01-01T00:00:00.000Z",
      "id": "9abc…",
      "name": "orders",
      "primary": {
        "address": "192.0.2.20",
        "engine": "mysql",
        "externalAddress": "203.0.113.20",
        "flavor": "dsa.large.v1",
        "health": "HEALTHY",
        "status": "ACTIVE",
        "storageGb": 10,
        "version": "8.0.34"
      }
    }
  ],
  "profile": "prod",
  "project": { "domainId": "1234…", "id": "5678…", "name": "my-project" }
}
```

`nipa lb ls --json` prints the profile, the project and its load balancers, newest first. `status` is Octavia's provisioning status, such as `ACTIVE` or `PENDING_CREATE`, `health` its operating status, such as `ONLINE` or `OFFLINE`, and `address` the virtual IP:

```json
{
  "loadBalancers": [
    {
      "address": "192.0.2.30",
      "createdAt": "2030-01-01T10:00:00+07:00",
      "health": "ONLINE",
      "id": "9abc…",
      "listeners": 2,
      "name": "web-lb",
      "status": "ACTIVE"
    }
  ],
  "profile": "prod",
  "project": { "domainId": "1234…", "id": "5678…", "name": "my-project" }
}
```

`nipa ip ls --json` prints the profile, the project and its external IPs. `status` is `ACTIVE` when the IP forwards traffic and `DOWN` when it doesn't, and `internalAddress` is `null` when the IP isn't attached:

```json
{
  "ips": [
    {
      "address": "203.0.113.10",
      "id": "9abc…",
      "internalAddress": "192.0.2.5",
      "name": "203.0.113.10",
      "status": "ACTIVE",
      "zone": "NCP-BKK"
    }
  ],
  "profile": "prod",
  "project": { "domainId": "1234…", "id": "5678…", "name": "my-project" }
}
```

`nipa profile ls --json` prints an array with one object per profile. Each object has `name`, `current`, `loggedIn`, `authUrl`, `userDomain`, `region` and `spaceUrl`. It also has `username` and `project` from the last login, and `user` while the session is active.

## Update check

On a terminal, nipa checks the [GitHub releases](https://github.com/PunGrumpy/nipa/releases) for a newer version at most once every 24 hours, after the command finishes. It waits at most 1.5 seconds for the answer. When a newer version exists, nipa prints a box with the version and a link to its release notes.

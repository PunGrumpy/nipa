<!-- contentType: Reference · plan: docs/content-plan.md -->

# CLI reference

This page lists the commands, options, environment variables, files, exit codes and JSON output of `nipa`. It matches the code in `packages/cli/src/` and the output of `nipa <command> --help`.

## Commands

nipa has 11 commands. Without a command, it prints help.

| Command | What it does |
| --- | --- |
| `nipa login [options]` | Asks for your email and password, then for a one-time password (OTP) code when your account uses multi-factor authentication (MFA). Saves a token scoped to a project |
| `nipa logout` | Revokes the current profile's token and deletes its session |
| `nipa whoami [--json]` | Shows your user, profile, project and when the session expires |
| `nipa switch [project]` | Scopes the session to another project by name or ID, without a password or OTP code |
| `nipa server ls [--json]` | Lists the servers in your project with their status, address, flavor and age. A server that a Kubernetes cluster made shows its role after its name, such as `(Kubernetes master)`. In a pipe, it prints one server ID per line. `nipa server`, `nipa servers` and `nipa server list` do the same |
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

## Command options

These options belong to one command:

| Option | Command | What it does |
| --- | --- | --- |
| `-u, --username <email>` | `login` | Logs in as this user instead of the last one |
| `-p, --project <project>` | `login` | Scopes the token to this project, by name or ID, instead of the last one |
| `--json` | `whoami`, `profile ls`, `server ls`, `db ls`, `lb ls`, `ip ls` | Prints JSON on stdout |
| `--shell <bash\|zsh\|fish>` | `env` | Picks the shell syntax. The default comes from `$SHELL` |
| `--auth-url <url>` | `profile add` | The Keystone URL, ending in `/v3` |
| `--user-domain <domain>` | `profile add` | The user domain. The default is `nipacloud` |
| `--region <region>` | `profile add` | The region. The default is `NCP-TH` |
| `--space-url <url>` | `profile add` | The Space portal URL, such as `https://space.nipa.cloud`, or its API URL. nipa saves the API under the portal's `/api` and checks that it answers. A profile on production's Keystone gets `https://space.nipa.cloud/api` without it. With another Keystone, nipa asks for it in a terminal, and Enter skips it |
| `--use` | `profile add` | Makes the new profile the current one |
| `--install` | `completion` | Saves the script where the shell loads it, instead of printing it |
| `-y, --yes` | `profile rm` | Removes the profile without asking |

## Global options

Global options work with every command. Put them before `os`, `tf` and `exec`, because nipa passes every word after those commands to the program they run, `--help` included.

| Option | Variable | What it does |
| --- | --- | --- |
| `-P, --profile <name>` | `NIPA_PROFILE` | Uses this profile instead of the current one |
| `-d, --debug` | `NIPA_DEBUG=1` | Logs each HTTP request: method, URL, status and time. Never headers or bodies |
| `--no-color` | `NO_COLOR=1` | Turns off colors |
| `-h, --help` |  | Prints help |
| `-v, --version` |  | Prints the version |

nipa picks the profile in this order: `--profile`, then `NIPA_PROFILE`, then `currentProfile` in `config.json`.

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
| `~/.cache/nipa/update.json` | The latest version on GitHub and when nipa checked |
| `~/.cache/nipa/openstack.json` | openstack's commands and options, for tab completion after `nipa os` |
| `~/.cache/nipa/completion.json` | Where `nipa completion --install` saved each script, and the nipa version that wrote it. When the version changes, the next command rewrites the script |

nipa 0.1 kept one profile's fields and one session at the top level of these files. nipa reads that format as the `prod` profile and writes the new format the next time it saves.

`prod` is always there. Its defaults are `https://identity-api.nipa.cloud/v3`, user domain `nipacloud`, region `NCP-TH` and Space API `https://space.nipa.cloud/api`. A profile on production's Keystone without `spaceUrl` uses that Space API. A profile on another Keystone without `spaceUrl` has none, so `server ls`, `db ls`, `lb ls` and `ip ls` don't work with it. nipa 0.1.4 gave every new profile production's Space API, which takes only production's tokens, so nipa drops it from profiles on another Keystone.

## Exit codes

nipa exits with these codes:

| Code | Meaning |
| --- | --- |
| `0` | The command worked |
| `1` | An error, such as a wrong password or an expired session |
| `2` | A usage error: an unknown command or option, a missing value or argument, or an extra argument |
| `127` | `nipa exec` couldn't find the command |
| `130` | You pressed Ctrl+C at a prompt |

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
  "region": "NCP-TH",
  "user": { "id": "9012…", "name": "me@example.com" }
}
```

Without a session, it prints `{"loggedIn":false,"profile":"prod"}` and exits with code `1`.

`nipa server ls --json` prints the profile, the project and its servers, newest first. `status` is the server's OpenStack status, such as `ACTIVE` or `SHUTOFF`, and an address's `type` is `fixed` for an internal IP or `floating` for an external one. `kubernetes` is `null` for a server you made. For a Kubernetes node, it has the Magnum cluster's `clusterId` and the node's `role`, such as `master`. `role` is `null` when Magnum sets none:

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
      "status": "ACTIVE"
    }
  ]
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

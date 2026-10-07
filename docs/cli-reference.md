<!-- contentType: Reference · plan: docs/content-plan.md -->

# CLI reference

This page lists the commands, options, environment variables, files, exit codes and JSON output of `nipa`. It matches the code in `packages/cli/src/` and the output of `nipa <command> --help`.

## Commands

nipa has 23 commands. Without a command, it prints help.

| Command | What it does |
| --- | --- |
| `nipa login [options]` | Asks for your email and password, then for a one-time password (OTP) code when your account uses multi-factor authentication (MFA). Saves a token scoped to a project. With `--remember`, saves your password in the OS keychain, so later logins ask only for an OTP code |
| `nipa logout` | Revokes the current profile's token, deletes its session, and deletes a password that `--remember` saved |
| `nipa whoami [--json]` | Shows your user, profile, project and when the session expires |
| `nipa switch [project]` | Scopes the session to another project by name or ID, without a password or OTP code. In a linked folder, it changes the saved project, and the folder keeps its own |
| `nipa link [project]` | Links this folder to the profile and a project, by name or ID, in `.nipa/project.json`. Commands in this folder and the folders below it use them |
| `nipa unlink` | Deletes the closest `.nipa/project.json`, at or above this folder |
| `nipa server ls [--json]` | Lists the servers in your project with their status, address, flavor and age. A server that a Kubernetes cluster made shows its role after its name, such as `(Kubernetes master)`. In a pipe, it prints one server ID per line. `nipa server`, `nipa servers` and `nipa server list` do the same |
| `nipa server inspect <server> [--json]` | Shows one server's ID, status, flavor with its vCPUs and RAM, zone, addresses, volumes, security groups and age, by name or ID. It also shows Nova's task while the server is busy, whether the server is locked, and the last action on it, such as `create failed 26m ago by Ann`. Those three come from two more calls, so when one fails, such as while Nova works on the server, the field says `unavailable` and the rest still prints. For a server in Error, it names `nipa server history` and `nipa server logs`. In a pipe, it prints the server's ID |
| `nipa server history <server> [--json]` | Lists the actions on a server, newest first, with their age, the user who asked, the result and the request ID. A failed action's result is `Error`. In a pipe, it prints one request ID per line. `nipa server events` is the same command |
| `nipa server logs <server> [options]` | Prints a server's console log on stdout as it is, cloud-init output included. The Space API sends the last 100 lines, and `--tail` keeps fewer. A server that never booted has no console log, so nipa exits with code `1` and names `nipa server history` |
| `nipa server start <server> [options]` | Starts a stopped server, then waits until it's active |
| `nipa server stop <server> [options]` | Stops a server after you confirm, then waits until it's shut off |
| `nipa server restart <server> [options]` | Restarts a running server after you confirm, then waits until it's active again. `nipa server reboot` is the same command |
| `nipa flavor ls [--json]` | Lists the flavors a server can have, smallest first, with their vCPUs, RAM and type. The Space portal calls them machine types. The ones only database clusters use don't show. In a pipe, it prints one flavor name per line. `nipa flavor`, `nipa flavors` and `nipa machine-types` do the same |
| `nipa volume ls [--json]` | Lists the block storage volumes in your project with their status, size, type, the server each one is attached to, and age. In a pipe, it prints one volume ID per line. `nipa volume` and `nipa volumes` do the same |
| `nipa network ls [--json]` | Lists the networks your project can use with their status, type, zone and age. `VPC` marks one of your project's private networks, and `external` a shared pool of external IPs. In a pipe, it prints one network ID per line. `nipa network` and `nipa networks` do the same |
| `nipa sg ls [--json]` | Lists the security groups in your project with their inbound and outbound rule counts, age and description. In a pipe, it prints one security group ID per line. `nipa sg`, `nipa security-group` and `nipa security-groups` do the same |
| `nipa sg inspect <group> [--json]` | Shows one security group's ID, description, the servers that use it with their addresses, and its inbound and outbound rules, by name or ID. Each rule shows its protocol, ports, the CIDR or security group it allows, and its ethertype. `any` means every protocol, port or address. A `!` marks an inbound rule that opens SSH, RDP or a database port to any address, and a note below the table names the ports. In a pipe, it prints the group's ID |
| `nipa k8s ls [--json]` | Lists the Kubernetes clusters in your project with their Kubernetes version, nodes, active node count and age. The Space API has no Kubernetes endpoint, so nipa finds each cluster through the servers Magnum made for it, and a cluster without servers doesn't show. In a pipe, it prints one cluster ID per line. `nipa k8s`, `nipa kubernetes` and `nipa coe` do the same |
| `nipa db ls [--json]` | Lists the database clusters in your project with their engine, status, address, flavor and age. The address is the primary's external IP, or its internal IP without one. In a pipe, it prints one cluster ID per line. `nipa db`, `nipa database` and `nipa databases` do the same |
| `nipa lb ls [--json]` | Lists the load balancers in your project with their status, health, virtual IP, listener count and age. In a pipe, it prints one load balancer ID per line. `nipa lb`, `nipa loadbalancer` and `nipa loadbalancers` do the same |
| `nipa ip ls [--json]` | Lists the external IPs in your project with their status, the internal IP each one forwards to, zone and name. An IP without an internal IP isn't attached to anything. In a pipe, it prints one address per line. `nipa ip` and `nipa ips` do the same |
| `nipa open [resource] [name] [--url]` | Opens the Space portal of the profile in your browser. `resource` is `server`, `volume`, `network`, `sg`, `lb` or `db`, and opens that list. With a name or ID too, it opens that resource's page, or for a volume the volume list filtered to it, which needs a session. The portal opens the project you last used in it, because a URL can't pick one. In a pipe, or with `--url`, it prints only the URL and opens nothing |
| `nipa quota ls [--json]` | Shows each quota of your project, such as servers, vCPUs, RAM and volumes, by group, with how much it uses, its limit and the percent used. A quota at 80% or more shows in yellow, and one at 100% shows in red, because the next create of that resource fails. A note under the table counts them. It exits with code `0` either way. In a pipe, it prints one tab-separated line per quota: its group and name, such as `compute/ram`, the amount used, the limit or `unlimited`, and the unit of both, such as `MB`, `GB` or `Bytes`, or `-` for a count. `nipa quota`, `nipa quotas` and `nipa limits` do the same |
| `nipa os <args...>` | Runs `openstack <args...>` with the session. `nipa openstack` is the same command |
| `nipa tf <args...>` | Runs `terraform <args...>` with the session. `nipa terraform` is the same command |
| `nipa exec <command> [args...]` | Runs any command with the session |
| `nipa env [--shell bash\|zsh\|fish]` | Prints the session's `OS_*` variables as shell commands |
| `nipa profile [ls\|add\|use\|rm]` | Lists, adds, picks or removes profiles |
| `nipa doctor [--json]` | Checks the config files, the profile, its Keystone and Space API, the session and whether Keystone and the Space API accept its token, the folder's link, `openstack` and `terraform`, and the last update check. It prints how to fix each problem, changes nothing, never asks for a password, and exits with code `1` when a check fails. A warning doesn't change the exit code |
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
| `--json` | `whoami`, `doctor`, `profile ls`, `server ls`, `server inspect`, `server history`, `server logs`, `flavor ls`, `volume ls`, `network ls`, `sg ls`, `sg inspect`, `k8s ls`, `db ls`, `lb ls`, `ip ls`, `quota ls` | Prints JSON on stdout |
| `--url` | `open` | Prints the portal URL on stdout instead of opening a browser |
| `--shell <bash\|zsh\|fish>` | `env` | Picks the shell syntax. The default comes from `$SHELL` |
| `--auth-url <url>` | `profile add` | The Keystone URL, ending in `/v3` |
| `--user-domain <domain>` | `profile add` | The user domain. The default is `nipacloud` |
| `--region <region>` | `profile add` | The region. The default is `NCP-TH` |
| `--space-url <url>` | `profile add` | The Space portal URL, such as `https://space.nipa.cloud`, or its API URL. nipa saves the API under the portal's `/api` and checks that it answers. A profile on production's Keystone gets `https://space.nipa.cloud/api` without it. With another Keystone, nipa asks for it in a terminal, and Enter skips it |
| `--use` | `profile add` | Makes the new profile the current one |
| `--install` | `completion` | Saves the script where the shell loads it, instead of printing it |
| `-y, --yes` | `profile rm`, `server stop`, `server restart` | Skips the confirmation. Without a terminal, these commands need it |
| `--no-wait` | `server start`, `server stop`, `server restart` | Returns once the Space API takes the action, without waiting for the server |
| `-n, --tail <n>` | `server logs` | Prints only the last `n` lines. Without it, nipa prints every line the Space API sends |
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
| `~/.cache/nipa/names.json` | Server, security group, flavor, image and network names from the Space API, for tab completion, kept for a minute per profile and project |
| `~/.cache/nipa/completion.json` | Where `nipa completion --install` saved each script, and the nipa version that wrote it. When the version changes, the next command rewrites the script |

nipa 0.1 kept one profile's fields and one session at the top level of these files. nipa reads that format as the `prod` profile and writes the new format the next time it saves.

`prod` is always there. Its defaults are `https://identity-api.nipa.cloud/v3`, user domain `nipacloud`, region `NCP-TH` and Space API `https://space.nipa.cloud/api`. A profile on production's Keystone without `spaceUrl` uses that Space API. A profile on another Keystone without `spaceUrl` has none, so `server ls`, `flavor ls`, `volume ls`, `network ls`, `sg ls`, `k8s ls`, `db ls`, `lb ls`, `ip ls` and `quota ls` don't work with it. nipa 0.1.4 gave every new profile production's Space API, which takes only production's tokens, so nipa drops it from profiles on another Keystone.

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

`nipa server inspect --json` adds three fields to the server. `taskState` is Nova's task, such as `powering-off`, or `null` when the server is idle. `locked` is `true` when the server is locked against changes, and `null` when the Space API doesn't say. `lastAction` is the newest action, with the fields `nipa server history --json` prints, or `null` when the server has none. The three come from two calls after the server itself. When one fails, nipa says so on stderr, prints the server, and sets the fields from that call to `null`: `taskState` and `locked` for the server's state, `lastAction` for its actions:

```json
{
  "lastAction": {
    "action": "create",
    "remark": "Error",
    "requestId": "req-1ab8…",
    "startedAt": "2030-01-01T00:00:00.000000Z",
    "user": "Ann Example"
  },
  "locked": false,
  "taskState": null
}
```

`nipa server history --json` prints the profile, the project, the server's ID and name, and its actions, newest first. `action` is Nova's action, such as `create`, `stop` or `reboot`. `remark` is `Error` when the action failed, and `null` otherwise. `requestId` is the ID that Nova logs the action under. `user` is `null` when the Space API doesn't send it:

```json
{
  "actions": [
    {
      "action": "create",
      "remark": "Error",
      "requestId": "req-1ab8…",
      "startedAt": "2030-01-01T00:00:00.000000Z",
      "user": "Ann Example"
    }
  ],
  "profile": "prod",
  "project": { "domainId": "1234…", "id": "5678…", "name": "my-project" },
  "server": { "id": "9abc…", "name": "web-1" }
}
```

`nipa server logs --json` prints the profile, the project, the server's ID and name, and `logs`, the console log as one string, after `--tail`:

```json
{
  "logs": "[  OK  ] Reached target cloud-init.target - Cloud-init target.\nweb-1 login: \n",
  "profile": "prod",
  "project": { "domainId": "1234…", "id": "5678…", "name": "my-project" },
  "server": { "id": "9abc…", "name": "web-1" }
}
```

`nipa flavor ls --json` prints the profile, the project and the flavors a server can have, smallest first. `type` is the portal's category, such as `Shared-core` or `Memory Intensive`, and `cpuPolicy` is `shared` or `dedicated`. Both are `null` when the Space API doesn't send them:

```json
{
  "flavors": [
    {
      "cpuPolicy": "shared",
      "id": "9abc…",
      "name": "csa.large.v2",
      "ramMb": 4096,
      "type": "Shared-Core",
      "vcpus": 2
    }
  ],
  "profile": "prod",
  "project": { "domainId": "1234…", "id": "5678…", "name": "my-project" }
}
```

`nipa volume ls --json` prints the profile, the project and its volumes, newest first. `status` is Cinder's status, such as `available`, `in-use` or `creating`. `attachments` lists the servers the volume is attached to, by `serverId`, and the `device` each one sees it as. `type` is `null` when the volume has none:

```json
{
  "profile": "prod",
  "project": { "domainId": "1234…", "id": "5678…", "name": "my-project" },
  "volumes": [
    {
      "attachments": [{ "device": "/dev/vda", "serverId": "9abc…" }],
      "bootable": true,
      "createdAt": "2030-01-01T10:00:00+07:00",
      "id": "def0…",
      "name": "web-1-vol-0",
      "sizeGb": 10,
      "status": "in-use",
      "type": "Standard_SSD",
      "zone": "NCP-BKK"
    }
  ]
}
```

`nipa network ls --json` prints the profile, the project and the networks it can use, newest first. `external` is `true` for a pool of external IPs and `false` for a VPC network, `shared` is `true` when other projects can use it too, and `zone` is `null` when Neutron picks one. nipa adds the `Z` that Neutron leaves off `createdAt`:

```json
{
  "networks": [
    {
      "createdAt": "2030-01-01T00:00:00.000000Z",
      "external": false,
      "id": "9abc…",
      "name": "default",
      "shared": false,
      "status": "ACTIVE",
      "zone": "NCP-BKK"
    }
  ],
  "profile": "prod",
  "project": { "domainId": "1234…", "id": "5678…", "name": "my-project" }
}
```

`nipa sg ls --json` prints the profile, the project and its security groups, newest first, with their rules. A rule's `direction` is `ingress` for traffic in and `egress` for traffic out. `portMin` and `portMax` are `null` for every port. A rule allows `remoteIpPrefix`, a CIDR, or the servers in the security group `remoteGroupId`, and both are `null` for anywhere. `description` is `null` when the group has none:

```json
{
  "profile": "prod",
  "project": { "domainId": "1234…", "id": "5678…", "name": "my-project" },
  "securityGroups": [
    {
      "createdAt": "2030-01-01T00:00:00.000000Z",
      "description": null,
      "id": "9abc…",
      "name": "web",
      "rules": [
        {
          "direction": "ingress",
          "ethertype": "IPv4",
          "id": "def0…",
          "portMax": 443,
          "portMin": 443,
          "protocol": "tcp",
          "remoteGroupId": null,
          "remoteIpPrefix": "0.0.0.0/0"
        }
      ]
    }
  ]
}
```

`nipa sg inspect --json` prints the profile, the project and the security group in the same shape as `sg ls`. Each rule adds `remoteGroupName`, the name of the group `remoteGroupId` names, or `null` without one or when the group isn't in the project. `servers` lists the servers with a network port in the group, newest first, with the addresses of those ports:

```json
{
  "profile": "prod",
  "project": { "domainId": "1234…", "id": "5678…", "name": "my-project" },
  "securityGroup": {
    "createdAt": "2030-01-01T00:00:00.000000Z",
    "description": "Default security group",
    "id": "9abc…",
    "name": "default",
    "rules": [
      {
        "direction": "ingress",
        "ethertype": "IPv4",
        "id": "def0…",
        "portMax": null,
        "portMin": null,
        "protocol": "any",
        "remoteGroupId": "9abc…",
        "remoteGroupName": "default",
        "remoteIpPrefix": null
      }
    ],
    "servers": [
      {
        "addresses": ["192.0.2.5"],
        "id": "2222…",
        "name": "web-1"
      }
    ]
  }
}
```

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

`nipa quota ls --json` prints the profile, the project and its quotas, by group. `group` and `name` are the Space API's, such as `compute` and `cores`. `used` and `limit` are in `unit`, such as `MB` for RAM, `GB` for volume size and `Bytes` for object storage, and `unit` is `null` for a count. `limit` is `null` when the quota has no limit:

```json
{
  "profile": "prod",
  "project": { "domainId": "1234…", "id": "5678…", "name": "my-project" },
  "quotas": [
    {
      "group": "compute",
      "limit": 20,
      "name": "cores",
      "unit": null,
      "used": 18
    },
    {
      "group": "compute",
      "limit": 51200,
      "name": "ram",
      "unit": "MB",
      "used": 45056
    },
    {
      "group": "network",
      "limit": null,
      "name": "port",
      "unit": null,
      "used": 11
    }
  ]
}
```

`nipa doctor --json` prints the profile it checked, or `null` when nipa couldn't pick one, and one object per check, in the order nipa runs them. `id` is one of `config`, `profile`, `keystone`, `space`, `session`, `token`, `link`, `tools` and `update`. `status` is `pass`, `warn`, `fail` or `skip`, and a check skips when one it needs didn't pass, such as `token` without a session. `hint` says how to fix a warning or failure, and is `null` otherwise:

```json
{
  "checks": [
    {
      "hint": "Run `nipa login -P staging`.",
      "id": "session",
      "status": "fail",
      "summary": "Your staging session expired",
      "title": "Session"
    },
    {
      "hint": null,
      "id": "token",
      "status": "skip",
      "summary": "Skipped because Session didn't pass",
      "title": "Token"
    }
  ],
  "profile": "staging"
}
```

`nipa profile ls --json` prints an array with one object per profile. Each object has `name`, `current`, `loggedIn`, `authUrl`, `userDomain`, `region` and `spaceUrl`. It also has `username` and `project` from the last login, and `user` while the session is active.

## Update check

On a terminal, nipa checks the [GitHub releases](https://github.com/PunGrumpy/nipa/releases) for a newer version at most once every 24 hours, after the command finishes. It waits at most 1.5 seconds for the answer. When a newer version exists, nipa prints a box with the version and a link to its release notes.

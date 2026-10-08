<!-- contentType: Troubleshooting · plan: docs/content-plan.md -->

# Fix login and session errors

This page lists the errors nipa prints, what causes each one, and how to fix it. Find the message you see in the headings below. If a request fails in a way this page doesn't cover, run the command again with `--debug` to see each HTTP request.

Run `nipa doctor` first. It checks the config files, the profile, Keystone, the Space API, the session and its token, and the folder's link in one go, and prints how to fix each problem. Add `-P <profile>` to check another profile. It changes nothing and never asks for a password, so it's safe to run in a script.

## "wrong email or password"

Keystone refused the password, or the email doesn't match an account in the profile's user domain. Check the email, then the user domain with `nipa profile ls`. Nipa Cloud accounts are in the `nipacloud` domain.

## "That code didn't work" or "wrong OTP code"

Keystone refused the OTP code. Each code works once and only for about 30s, so wait for the next code from your authenticator app and type that one. nipa asks again up to 3 times without asking for the password again. If every code fails, check that your phone sets its clock automatically, because each code depends on the time. On a first login, also check the project ID. Keystone refuses the login the same way when your account can't use that project.

## "this account's MFA rules don't allow this login method"

Keystone accepted the credentials but the account's MFA rule doesn't list the method you used. You see this when you log in with an application credential on an account with MFA. Use `nipa login` instead, and pass the session to other tools with `nipa exec` or `nipa env`.

## "you aren't logged in to prod" or "your prod session expired"

The profile has no session, or its token expired after the 24 hours a Nipa Cloud token lasts. In a terminal, nipa logs you in before it runs the command.

In a script, nothing can type a password, so nipa stops with this error instead. Run `nipa login` in a terminal, then run the script again.

## "your prod session expired or was revoked"

Keystone or the Space API refused the token before it expired, for example after you changed your password. Run `nipa login` to get a new token.

If it happens again right after a login, the profile's Space API may belong to another Keystone. Check its `authUrl` and `spaceUrl` with `nipa profile ls --json`.

## "the … profile has no Space API URL"

The profile's Keystone isn't production's, and nobody gave it a Space portal URL. Remove the profile with `nipa profile rm`, then add it again with `--space-url` and the URL of the portal that goes with its Keystone, such as `https://portal-stg-epc.nipa.cloud` for staging. Until then, `nipa -P <profile> os server list` runs the OpenStack client with the session.

## "`nipa login` needs a terminal to ask for your password"

You ran `nipa login` where nothing can type the answers, such as in continuous integration (CI) or with stdin redirected. nipa never reads a password from a pipe. Log in from a terminal first.

## "the macOS Keychain didn't save your password" or "nipa can't save your password on …"

`nipa login --remember` saves the password with the OS's own tool: `security` on macOS and `secret-tool` on Linux. On macOS, unlock your login keychain. On Linux, install `libsecret-tools` and run a secret service, such as GNOME Keyring, which a server without a desktop often lacks. On other systems, log in without `--remember`.

## "The saved password didn't work, so nipa deleted it."

Your password changed since `nipa login --remember` saved it. nipa asks for the new one. Log in with `--remember` again to save it.

## "no profile named …"

The name after `-P`, or in `NIPA_PROFILE`, isn't a profile. The error lists the profiles you have. Check `NIPA_PROFILE` with `echo $NIPA_PROFILE` if you didn't pass `-P`.

## "couldn't open a browser with …"

`nipa open` runs `open` on macOS, `xdg-open` on Linux and `start` on Windows, and that program is missing or failed, such as on a server without a desktop. Open the URL that nipa printed above the error, or run `nipa open --url` to print only the URL.

If the portal shows another project or a page that doesn't load, the portal is on the project you last used in it. Switch to the project that `nipa whoami` names in the portal, then open the link again.

## "can't reach …"

The request never got an answer. The host name didn't resolve, the server refused the connection, or the Transport Layer Security (TLS) handshake failed. Check the profile's Keystone URL with `nipa profile ls`, then your network connection.

If the host is `space.nipa.cloud`, logging in worked and the Space API didn't answer. Check your network connection. For another profile, check its `spaceUrl` with `nipa profile ls --json`.

## "… doesn't answer like Keystone v3"

`nipa profile add` sent a request to the URL and the answer wasn't Keystone's version document. Check that the URL is the identity endpoint, such as `https://identity-api.nipa.cloud/v3`, and not the portal.

## "command not found: openstack"

nipa looked for `openstack` on your `PATH` and in `~/.local/bin` and didn't find it. Install the OpenStack client with `pipx install python-openstackclient`. For `terraform`, install Terraform.

## "public endpoint for … service in … region not found"

`openstack` didn't find the service in the token's service catalog, Keystone's list of each service's URLs. On Nipa Cloud production, the catalog lists only these services:

- `compute`, `network` and `image`
- `volumev2` and `volumev3`
- `load-balancer` and `key-manager`
- `identity`

So `nipa os coe`, `nipa os database`, `nipa os stack` and `nipa os object` fail on production. nipa can't add a service that the catalog leaves out. Use the [Nipa Cloud Space](https://space.nipa.cloud) portal for those services, or a profile whose Keystone lists them, such as staging. To list your Kubernetes clusters, run `nipa k8s ls`, which finds them through the servers Magnum made. `nipa server ls` marks those servers with `(Kubernetes master)` or another role.

## "Quota exceeded for …" or "… limit exceeded"

`openstack`, `terraform` or the Space portal tried to create a server, volume, external IP or another resource, and your project already uses all of that quota. Run `nipa quota` to see each quota's use and limit. Red rows are at their limit, and yellow rows are at 80% or more. A server needs room in three quotas at once: servers, vCPUs and RAM.

Delete what you no longer use, such as a stopped server or a volume no server uses (`nipa volume ls` shows `-` under Server for it), or ask Nipa Cloud to raise the limit.

## "…/auth.json: …" or "…/config.json: …"

The file doesn't match the format nipa expects, for example after you edit it by hand. Fix the field the message names, or delete the file. Deleting `auth.json` logs you out of every profile. Deleting `config.json` removes your profiles except `prod`.

## A server is in Error

Nova couldn't finish an action on the server, most often its create. Look at it in three steps:

1. Run `nipa server inspect <server>`. `Last action` names the action that failed, how long ago, and who asked for it
2. Run `nipa server history <server>` to see every action on the server, newest first, with the request ID that Nova logged each one under. Give that ID to Nipa Cloud support when you ask them why it failed
3. Run `nipa server logs <server>` to read the console log, where cloud-init writes what it did at boot. If nipa says the server has no console log yet, the server never booted, so the cause is in the create, not inside the server

## You can't connect to a port on your server

A security group blocks every connection that none of its rules allows. Find the server's security groups with `nipa server inspect <server>`, then show each group's rules with `nipa sg inspect <group>`. Look for an inbound rule whose protocol and ports cover the port, such as `tcp` and `22` for SSH, and whose source covers your address. `any` means every protocol, port or address. A server gets traffic that any one of its groups allows. If no rule matches, add one in the [Nipa Cloud Space](https://space.nipa.cloud) portal, or with `nipa os security group rule create`.

If a rule matches and the connection still fails, check that the server is `ACTIVE` with `nipa server inspect`, that you connect to its external IP, and that a firewall on the server itself, such as `ufw`, allows the port.

## You can't connect to a database

Run `nipa db inspect <database>`. Its last line says whether the database is healthy, or what needs attention. Then check these:

- **Status and Health**: the database takes connections only when its status is `Active` and its health is `Healthy`. `Build` means Trove is still creating it. Health shows when Trove last checked it
- **Address**: connect to the address and port it shows. Without an `(external)` address, the database has only an internal IP, which answers only inside your project's network, such as from a server on that network
- **Allowed CIDRs**: when it lists ranges, your client's IP address must be in one of them
- **Replicas**: a replica that isn't `Active` and `Healthy` can't serve reads

If the database is healthy and you still can't connect, run `nipa db inspect <database> --json` and check `primary.allowedCidrs` and `primary.externalAddress` against where you connect from.

## A load balancer shows ACTIVE but doesn't serve

`nipa lb ls` shows only the load balancer's own status, and a listener or member can fail while it stays `ACTIVE` and `ONLINE`. Run `nipa lb inspect <lb>` to see each part. It prints in red the name of each listener, backend group or member that isn't `ACTIVE` and `ONLINE`, and its last line names what stops the load balancer from serving:

- A listener in `ERROR` or `PENDING_*` doesn't take traffic on its port. Delete it and add it again in the Space portal
- A listener with no members to send traffic to has no backend group, or one without members. Add a backend group or members to it
- Members that are down fail their backend group's health check. Check that each one runs its service on the port that `nipa lb inspect` shows, and that its security group lets the load balancer's network in

A fault shows once, on the part that has it. A member in `ERROR` makes its backend group and the load balancer `DEGRADED`, so the verdict names the member and not the two parts above it. A backup member that's `OFFLINE` or `DRAINING` isn't a fault, because it takes traffic only when the other members go down, and nipa says so in a line under the verdict.

## Tab completion does nothing

The completion script isn't loaded in your current shell. Open a new terminal after you add it to your startup file, or load it now with `eval "$(nipa completion bash)"`. In bash, completion after `nipa tf` and `nipa exec` also needs the `bash-completion` package.

After `nipa completion --install`, zsh loads the script only when `~/.zfunc` is on `$fpath` before `compinit` runs. Check with `print -l $fpath | grep zfunc`. bash loads the saved script only with the `bash-completion` package. If both an `eval` line and a saved script are set up, the last one to load wins, so keep one.

## The first Tab after `nipa os` is slow

nipa gets openstack's commands from `openstack complete`, which starts Python and loads every client plugin. nipa saves the list in `~/.cache/nipa/openstack.json` and runs `openstack complete` again only after the `openstack` executable changes.

## `nipa os` doesn't complete a plugin's commands

Installing a plugin, for example with `pipx inject python-openstackclient python-octaviaclient`, doesn't change the `openstack` executable, so nipa keeps the old list. Delete `~/.cache/nipa/openstack.json` and press Tab again.

## An old error appears after an update

Your shell may still have an old `nipa` function or alias that hides the binary. In fish, run `type nipa`. If it says `nipa is a function`, remove it with `functions -e nipa` and delete `~/.config/fish/functions/nipa.fish`.

<!-- contentType: Tutorial · plan: docs/content-plan.md -->

# Run your first command with nipa

In this tutorial you install nipa, log in to Nipa Cloud with a one-time password (OTP) code, and list the servers in your project. It takes about 5 minutes.

## What you need before you start

You need these 2 things:

- A Nipa Cloud account that you can log in to the portal with
- The authenticator app that gives you OTP codes for that account

## 1. Install nipa

Install nipa from npm, which needs Node.js 22.13 or later, then check the version:

```sh
npm install -g nipa-cli
nipa --version
```

Without Node.js, download the binary for your platform from the [latest release](https://github.com/PunGrumpy/nipa/releases/latest) instead. This example is for macOS on Apple silicon:

```sh
base=https://github.com/PunGrumpy/nipa/releases/latest/download
curl -fsSL -o ~/.local/bin/nipa "$base/nipa-darwin-arm64"
chmod +x ~/.local/bin/nipa
nipa --version
```

If your shell says `command not found` after the download, add `~/.local/bin` to your `PATH`.

## 2. Log in

Run `nipa login`. It asks for your email, your project ID and your password, then for an OTP code from your authenticator app:

```console
$ nipa login
> Logging in to prod (identity-api.nipa.cloud)
✔ Email me@example.com
✔ Project ID 1234567890abcdef1234567890abcdef
✔ Password ********
✔ OTP code 123456
> Success! Logged in as me@example.com, project my-project
```

The project ID is the 32-character `OS_PROJECT_ID` value in your project's openrc file. nipa asks for it only on your first login, because Nipa Cloud gives a token only for a project. nipa remembers your email and project, so the next login fills in your email and you type your password and a new OTP code. To use another project later, run `nipa switch`.

## 3. List your servers

Run `nipa server ls`:

```console
$ nipa server ls
> Servers in my-project [312ms]

  Name      Status        Address          Flavor            Age
  web-2     ● Build       192.0.2.7        csa.large.v2      2m
  web-1     ● Active      203.0.113.10     csa.large.v2      3d
  db-1      ● Shutoff     198.51.100.4     csa.xlarge.v2     40d
```

nipa calls the Space API, the one the Nipa Cloud Space portal uses, with your session, so it doesn't ask for a password. The session lasts until the token expires, which on Nipa Cloud is 24 hours. Run `nipa whoami` to see how long it has left.

For anything nipa has no command for yet, put `nipa os` in front of an `openstack` command, such as `nipa os volume list`. That runs the OpenStack client, which you install with `pipx install python-openstackclient`.

## 4. Turn on tab completion

nipa completes its commands, options, and your project and server names when you press Tab. After `nipa os`, it completes openstack's commands and options too. Add the line for your shell to its startup file:

```sh
echo 'eval "$(nipa completion zsh)"' >> ~/.zshrc
```

The line runs nipa each time zsh starts. To skip that, save the script where your shell loads it instead. nipa rewrites the saved script when nipa updates:

```sh
nipa completion --install
```

For zsh, `--install` also prints the `fpath` line to add to `~/.zshrc` when it isn't there. For bash, fish and PowerShell, run `nipa completion --help`.

## What to read next

Pick what to read next:

- **Run Terraform**: `nipa tf plan` runs `terraform plan` with the same session
- **Use staging**: [Use nipa with a staging Keystone](profiles.md) adds a second Keystone
- **Look something up**: the [CLI reference](cli-reference.md) lists every command and option

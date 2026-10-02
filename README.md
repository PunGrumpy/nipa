# nipa

Log in to Nipa Cloud once with your password and an OTP code, then run `openstack`, `terraform` or any OpenStack tool with that session.

Nipa Cloud accounts with MFA can't use a plain `openrc` file, and Keystone refuses application credentials while MFA is on. `nipa` does the multi-factor login, saves the token and passes it to the tools you run:

```console
$ nipa login
> Log in to Nipa Cloud (identity-api.nipa.cloud)
> Username me@example.com
◇ Password
◇ OTP code  123456
> Success! Logged in as me@example.com (my-project, expires in 23h 59m)

$ nipa os server list
$ nipa tf plan
```

## Install

Download the binary for your platform from the [latest release](https://github.com/PunGrumpy/nipa-cli/releases/latest) and put it on your `PATH`:

```sh
# macOS on Apple silicon; use nipa-darwin-x64, nipa-linux-x64 or nipa-linux-arm64 for others
curl -fsSL -o ~/.local/bin/nipa \
  https://github.com/PunGrumpy/nipa-cli/releases/latest/download/nipa-darwin-arm64
chmod +x ~/.local/bin/nipa
```

On Windows, download `nipa-windows-x64.exe` and rename it to `nipa.exe`. Each release has a `SHA256SUMS` file to check the download.

To build from source, install [Bun](https://bun.sh) and run `bun install && bun run build`. The binary is `dist/nipa`.

`nipa os` needs the OpenStack client (`pipx install python-openstackclient`) and `nipa tf` needs Terraform. `nipa` finds `openstack` on your `PATH` or in `~/.local/bin`.

## Commands

| Command | What it does |
| --- | --- |
| `nipa login [-u email] [-p project]` | Asks for your password and OTP code, then saves a token scoped to a project. The first time, it lists your projects to pick from. |
| `nipa whoami [--json]` | Prints the user, project and how long the token has left. Only the user name goes to stdout. |
| `nipa switch [project]` | Scopes the session to another project, by name or ID. It doesn't ask for your password or an OTP code. |
| `nipa os <args>` | Runs `openstack <args>` with the session. |
| `nipa tf <args>` | Runs `terraform <args>` with the session. |
| `nipa exec <cmd> <args>` | Runs any command with the session, for example `ansible-playbook` or a Python script using `openstacksdk`. |
| `nipa env [--shell bash\|zsh\|fish]` | Prints the `OS_*` variables, to load the session into your shell. |
| `nipa logout` | Revokes the token and deletes the session. |
| `nipa completion <shell>` | Prints the tab completion script for bash, zsh, fish or PowerShell. |

When the token has expired, `nipa os`, `nipa tf` and `nipa exec` ask you to log in again before they run. In a script, with no terminal to ask, they fail with a message instead.

`nipa exec` removes any `OS_*` variable already in your shell before it adds the session's, so a stale `OS_PASSWORD` or `OS_CLOUD` from an old `openrc` can't override the token. `nipa exec` exits with the command's exit code.

### Load the session into your shell

If you prefer plain `openstack` and `terraform` commands:

```sh
eval "$(nipa env)"     # bash, zsh
nipa env | source      # fish
```

The variables hold the token, so they stop working when it expires. Run the line again after `nipa login`.

## Tab completion

```sh
echo 'eval "$(nipa completion bash)"' >> ~/.bashrc
echo 'eval "$(nipa completion zsh)"' >> ~/.zshrc
nipa completion fish > ~/.config/fish/completions/nipa.fish
```

In PowerShell:

```powershell
Add-Content $PROFILE 'nipa completion pwsh | Out-String | Invoke-Expression'
```

Completion covers commands, options and their values. `nipa switch <Tab>` and `nipa login --project <Tab>` list your projects while you are logged in. After `nipa os`, `nipa tf` and `nipa exec`, Tab completes the wrapped command. Bash needs the `bash-completion` package for that part.

## Where nipa keeps its files

`nipa` keeps its files in `NIPA_CONFIG_DIR` when it is set, otherwise in `$XDG_CONFIG_HOME/nipa/`, otherwise in `~/.config/nipa/`.

| File | Contents |
| --- | --- |
| `config.json` | Keystone URL, user domain, region, your user name and the last project. Kept after `nipa logout`. |
| `auth.json` | The token, its expiry, the user and the project. Deleted by `nipa logout`. |

`nipa` writes both files with mode `0600` in a `0700` directory. The token is a bearer token. Anyone who reads `auth.json` can act as you until it expires.

The defaults are Nipa Cloud's: `https://identity-api.nipa.cloud/v3`, user domain `nipacloud` and region `NCP-TH`. Edit `config.json` to use another Keystone.

## How login works

`nipa login` sends one Keystone request with both the `password` and `totp` methods, which is what an MFA rule of `password + totp` requires. If `nipa` knows the project, it scopes the token to it in the same request. Otherwise `nipa` gets an unscoped token, lists your projects and exchanges the token for a scoped one. `nipa switch` makes the same exchange with the token method.

When Keystone refuses a login because of MFA rules, it returns an _auth receipt_ instead of a token. `nipa` reads it and tells you which methods your account needs, instead of a generic "401 Unauthorized".

## Contributing

```sh
bun install
bun run dev -- whoami   # run from source
bun test                # unit tests, CLI tests and real Tab presses in bash, zsh, fish and pwsh
bun run check           # Ultracite (oxlint + oxfmt)
bun run typecheck
```

The tests run against a fake Keystone that enforces password + TOTP, so they need no account. The completion tests skip a shell that isn't installed. CI installs all four and runs every test.

Commit messages and pull request titles follow [Conventional Commits](https://www.conventionalcommits.org) without a scope, for example `feat: add nipa switch`.

## Releases

Every pull request that changes what users get needs a changeset (`bun changeset`). See [.changeset/README.md](.changeset/README.md). When changesets reach `main`, a "chore: version packages" pull request opens. Merging it updates `CHANGELOG.md`, tags the version and publishes binaries for macOS, Linux and Windows to a GitHub release.

## License

[MIT](LICENSE)

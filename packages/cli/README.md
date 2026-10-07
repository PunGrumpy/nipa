<!-- contentType: Landing · plan: docs/content-plan.md -->

<h1 align="center">nipa</h1>

<p align="center">Log in to Nipa Cloud once a day. Run OpenStack tools all day.</p>

<p align="center">
  <a href="https://github.com/PunGrumpy/nipa/blob/main/docs/quickstart.md"><strong>Quickstart</strong></a> ·
  <a href="https://github.com/PunGrumpy/nipa/blob/main/docs/cli-reference.md"><strong>CLI reference</strong></a> ·
  <a href="https://github.com/PunGrumpy/nipa/blob/main/docs/troubleshooting.md"><strong>Troubleshooting</strong></a> ·
  <a href="https://github.com/PunGrumpy/nipa/releases/latest"><strong>Releases</strong></a>
</p>

## Usage

nipa logs in to Nipa Cloud with your password and a one-time password (OTP) code, then runs `openstack`, `terraform` or any OpenStack tool with that session. You type an OTP code once a day, not once per command.

Install nipa from npm. It needs Node.js 22.13 or later:

```sh
npm install -g nipa-cli
```

Without Node.js, download the binary for your platform from the [latest release](https://github.com/PunGrumpy/nipa/releases/latest).

Log in, then run commands with that session:

```sh
nipa login
nipa server ls
nipa server inspect web-1
nipa os volume list
nipa tf plan
```

`nipa server` lists, inspects, starts, stops and restarts your servers. `nipa flavor`, `volume`, `network`, `sg`, `ip`, `lb`, `k8s` and `db` list the rest of your project through the API the Space portal calls, which works where `openstack` can't reach a service, such as Kubernetes on production. `nipa os` runs `openstack` and `nipa tf` runs `terraform`. Run `nipa --help` for every command.

To use one profile and project in a folder, such as your Terraform code, run `nipa -P staging link my-project` there.

## Documentation

Pick the page for what you want to do:

- [Run your first command with nipa](https://github.com/PunGrumpy/nipa/blob/main/docs/quickstart.md): install, log in and list servers
- [Use nipa with a staging Keystone](https://github.com/PunGrumpy/nipa/blob/main/docs/profiles.md): add a profile and switch to it
- [How nipa logs in with MFA](https://github.com/PunGrumpy/nipa/blob/main/docs/how-login-works.md): what nipa sends to Keystone and where it keeps the token
- [Fix login and session errors](https://github.com/PunGrumpy/nipa/blob/main/docs/troubleshooting.md): find the cause of an error message

## Contributing

nipa is a TypeScript monorepo that runs on [Bun](https://bun.sh), with the CLI in `packages/cli`. Install the dependencies, then run the checks that CI runs:

```sh
bun install
bun run test
bun run check
bun run typecheck
```

The tests run against a fake Keystone, so you don't need an account. [Add a command to nipa](https://github.com/PunGrumpy/nipa/blob/main/docs/add-a-command.md) and [Release nipa](https://github.com/PunGrumpy/nipa/blob/main/docs/releasing.md) cover the rest, including [Conventional Commits](https://www.conventionalcommits.org) and changesets.

## License

[MIT](https://github.com/PunGrumpy/nipa/blob/main/LICENSE)

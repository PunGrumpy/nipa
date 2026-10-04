# nipa

nipa logs in to Nipa Cloud with your password and a one-time password (OTP) code, then lists your servers or runs `openstack` and `terraform` with that session. You type an OTP code once a day, not once per command.

## Install nipa

Install the `nipa` command from npm. It needs Node.js 22.13 or later:

```sh
npm install -g nipa-cli
```

Each [GitHub release](https://github.com/PunGrumpy/nipa/releases/latest) also has a binary for macOS, Linux and Windows that needs nothing else installed.

## Run your first commands

Log in, then list the servers in your project:

```sh
nipa login
nipa server ls
```

Put `nipa os` in front of any `openstack` command for everything else, such as `nipa os volume list`.

The [documentation](https://github.com/PunGrumpy/nipa#read-the-docs) covers profiles, tab completion and every command.

# Security policy

## Report a vulnerability

Report a vulnerability in private through [a security advisory on GitHub](https://github.com/PunGrumpy/nipa/security/advisories/new). Don't open a public issue or pull request for it, and don't include a real token, password or OTP code in the report.

Say which version of nipa you ran, what you did and what happened. A command that reproduces the problem against a test account helps most.

## What to report

nipa handles your password, your OTP code and a Keystone token, so these are in scope:

- A token, password or OTP code that nipa writes to a log, an error message or a file other than the ones [How nipa logs in](../docs/how-login-works.md) names.
- Files in `~/.config/nipa` that another user of the computer can read.
- A way to make nipa send a token or a password to a host that isn't the profile's Keystone or Space API.
- A release binary or npm package that differs from what the release workflow built.

A problem in Nipa Cloud itself, such as its portal or its API, goes to [Nipa Cloud](https://nipa.cloud).

## Supported versions

Fixes go into the newest release. Update with `npm install -g nipa-cli` before you report a problem.

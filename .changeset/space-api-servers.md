---
"nipa-cli": patch
---

`nipa server ls` calls Nipa Cloud's Space API at `https://space.nipa.cloud/api` on port 443, instead of the compute endpoint in Keystone's catalog on port 8774, which many networks can't reach. A profile keeps its Space API URL in `spaceUrl`, and `nipa profile add --space-url` sets it. `nipa server ls --json` no longer has `network` on each address, because the Space API doesn't name it. nipa no longer reads Keystone's catalog or saves its endpoints in `auth.json`.

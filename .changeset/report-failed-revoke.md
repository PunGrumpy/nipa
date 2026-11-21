---
"nipa-cli": patch
---

`nipa logout` and `nipa profile rm` now say when Keystone couldn't revoke a token. Previously, they could log out locally without warning while the token remained valid until it expired.

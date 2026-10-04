---
"nipa-cli": patch
---

`nipa login` and `nipa switch` get a token on Nipa Cloud again. Nipa's gateway drops the connection for a token without a service catalog, so nipa now asks for your project ID on a first login, takes it from `--project`, or uses the project from your last login.

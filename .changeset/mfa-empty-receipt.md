---
"nipa-cli": patch
---

`nipa login` asks for your OTP code on Nipa Cloud again. Nipa's gateway sends 401 responses with an empty body, so nipa couldn't read the account's MFA rules and printed an empty `Error:` instead.

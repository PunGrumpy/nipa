---
"nipa-cli": patch
---

Add `nipa login --remember`, which saves your password in the macOS Keychain, or with `secret-tool` on Linux, so later logins ask only for an OTP code. Keystone has no refresh token, so a session still lasts 24 hours. When Keystone refuses a saved password, nipa deletes it and asks. `nipa logout` and `nipa profile rm` delete the saved password. Commands that use a session with less than 30 minutes left print a note with the login command first.

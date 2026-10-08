---
"nipa-cli": patch
---

Add `nipa doctor`, which checks your setup in one go and says what to fix: the config files, which profile the run uses and why, whether its Keystone and Space API answer and how fast, the session and when it expires, whether Keystone and the Space API accept its token, the folder's link, `openstack` and `terraform`, and a newer nipa from the last update check. It changes nothing and never asks for a password, so it works in scripts. `--json` prints each check's `id`, `status`, `summary` and `hint`. It exits with code 1 when a check fails, and a warning doesn't change the exit code.

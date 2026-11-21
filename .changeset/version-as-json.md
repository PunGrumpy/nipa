---
"nipa-cli": patch
---

`nipa --version --json` and `nipa server ls --version --json` now print `{"version":"…"}` on one line and exit 0. `nipa --version --json` used to fail with `unknown option "--json"`, and `nipa server ls --version --json` printed the bare version even though the run asked for JSON.

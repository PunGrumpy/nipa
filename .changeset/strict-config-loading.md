---
"nipa-cli": patch
---

A `config.json` that nipa can't read, such as one with a typo or a profile with a bad URL, now fails with an error that names the file, instead of loading as a nipa 0.1 file with only the `prod` profile and deleting the other profiles on the next save. A profile on production's Keystone keeps its Space API URL however the Keystone URL was typed, with or without `/v3`.

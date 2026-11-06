---
"nipa-cli": patch
---

`nipa -p Beta server ls` now looks at another project for one run, without `nipa switch` changing the project every terminal uses. `-p, --project` takes a project name or ID, works before or after the command (and before `os`, `tf` and `exec`), beats a folder's link, and is never saved. nipa prints `Using project Beta`. A 32-character ID costs no extra request. A name that no project has now exits with code 2 and lists your projects, and a name that two projects share fails and lists their IDs, in `login`, `switch` and `link` too, instead of picking the first. `nipa login -p` still chooses the project to save.

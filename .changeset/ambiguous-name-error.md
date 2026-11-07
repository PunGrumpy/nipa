---
"nipa-cli": patch
---

When two servers share a name, `nipa server stop worker` and the other commands that take a server now list each candidate on its own line with its full ID, its status and its address, so you can tell which one you meant and copy its ID. Before, the error ran the IDs together on one line that wrapped in the middle of an ID. The error shows at most five, then says how many more there are and which `ls` command lists them. Volumes, networks, security groups, load balancers and databases that share a name get the same list of IDs. With `--json`, the error keeps its `ambiguous_name` reason on one line, and its `hint` now holds the list, with the lines joined by `\n`.

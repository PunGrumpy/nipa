---
"nipa-cli": patch
---

When two servers share a name, `nipa server stop worker` and the other commands that take a server now list each candidate on its own line with its full ID, its status and its address, so you can tell which one you meant and copy its ID. Before, the error ran the IDs together on one line that wrapped in the middle of an ID. The error shows at most five, then says how many more there are and to run the `ls` command with `--json` for their IDs. Volumes, networks, load balancers and databases that share a name get the same list with their status, and an address where they have one, and security groups list their IDs. With `--json`, the error stays one line with its `ambiguous_name` reason, and its `hint` still names every ID.

---
"nipa-cli": patch
---

`nipa mcp` now keeps each project's session in memory while it runs, so an assistant's later tool calls for the same project make one request instead of three. A `nipa login` or `nipa switch` in another terminal still takes effect on the next call, and nothing is saved to disk. `nipa sg inspect` and the `inspect_security_group` tool also load the ports and servers while they look up the group, so they wait for one round of requests instead of two.

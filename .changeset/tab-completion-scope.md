---
"nipa-cli": patch
---

Tab completion no longer hangs when the network is down: each request waits at most 2 seconds, an unreachable network fails on the first one, and then nipa offers the names it last saw, up to a day old. Project names are now kept for a minute like the other names, and `nipa -P staging -p Beta server inspect <Tab>` offers Beta's servers in the staging profile instead of the saved project's.

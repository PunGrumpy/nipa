---
"nipa-cli": patch
---

Add `nipa server history`, or `nipa server events`, to find out what happened to a server. It lists the actions on the server, newest first, with who asked, the result and the request ID, and `--json` prints them. A failed action's result is `Error`.

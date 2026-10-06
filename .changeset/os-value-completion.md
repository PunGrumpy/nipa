---
"nipa-cli": patch
---

Tab completion after `nipa os` completes server names after `server show`, `stop`, `start`, `delete` and the other commands that take only servers, and the names after `--flavor`, `--image` and `--network`. nipa reads them from the Space API, keeps them for a minute, and never asks for a password on a Tab press.

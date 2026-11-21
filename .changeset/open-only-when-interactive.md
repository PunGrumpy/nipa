---
"nipa-cli": patch
---

`nipa open` prints the portal URL instead of starting a browser when it can't prompt, including in CI. It still opens the browser in an interactive terminal.

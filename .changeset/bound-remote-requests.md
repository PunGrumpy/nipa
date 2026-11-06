---
"nipa-cli": patch
---

nipa now refuses to follow redirects from Keystone and the Space API, so a gateway that redirects can no longer send your token or password to another host, and a profile URL that redirects fails with an error naming the target. Requests give up after 30 seconds instead of hanging, a response that stalls or isn't JSON ends in a clear error instead of a stack trace, and resource names and API messages can no longer move the cursor, change the window title or reorder text in your terminal.

---
"nipa-cli": patch
---

Add `nipa volume ls`, which lists the block storage volumes in your project with their status, size, type, the server each one is attached to, and age. `nipa volumes` does the same. Volume statuses such as `in-use` and `creating` get the same colors as server statuses, and read as "In use" and "Creating".

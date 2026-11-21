---
"nipa-cli": patch
---

`nipa` now quotes server names in suggested commands and keeps remote line breaks and tabs from breaking output. Previously, names with spaces or control characters could make a command unusable or shift piped quota columns.

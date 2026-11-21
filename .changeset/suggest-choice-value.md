---
"nipa-cli": patch
---

nipa now suggests the closest value when you mistype one from a fixed set. `nipa completion fis` suggests `fish` ahead of the list of shells, and a far value such as `xyz` still prints only the list. In a `--json` error the guess is in `data.suggestion`.

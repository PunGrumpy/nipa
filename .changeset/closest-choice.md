---
"nipa-cli": patch
---

A mistyped value for an option or argument with a fixed set of values now suggests the closest one when exactly one is close, by the same rule as commands and options. `nipa completion fihs` suggests `fish` and `nipa investigate web-1 --kind servr` suggests `server`, before the list of values. In a `--json` error the guess is in `data.suggestion`. A value near none, or as near to two, such as `fsh`, still gets only the list.

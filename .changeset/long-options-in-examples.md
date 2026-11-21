---
"nipa-cli": patch
---

The examples on nipa's help pages now teach `--profile` and `--project` instead of `-P` and `-p`. A test parses every printed example, so a renamed option can no longer leave a broken one behind.

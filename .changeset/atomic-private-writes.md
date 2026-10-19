---
"nipa-cli": patch
---

nipa writes `config.json`, `auth.json` and its cache files by renaming a finished temp file into place, so a crash or a second nipa command can't leave a half-written file, and it keeps `~/.config/nipa` and `~/.cache/nipa` private (`0700`, files `0600`) on every write, not only when it creates them. When the update check can't reach GitHub, nipa remembers that for a day instead of waiting on it after every command, and a cache it can't write no longer fails the command.

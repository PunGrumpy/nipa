---
"nipa-cli": patch
---

Start `nipa` faster from npm by caching the compiled code between runs in Node.js's compile cache, which `NODE_DISABLE_COMPILE_CACHE` turns off.

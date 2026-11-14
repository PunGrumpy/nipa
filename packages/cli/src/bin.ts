#!/usr/bin/env node
// The entry of the npm bundle. Node caches the compiled code of modules it
// loads after enableCompileCache(), but not of the file that calls it, so the
// bundle is a chunk this file imports once the cache is on. Node picks the
// folder: NODE_COMPILE_CACHE if set, else a folder in the OS temp directory,
// and NODE_DISABLE_COMPILE_CACHE turns it off. A folder it can't write to
// leaves the cache off and nipa running.

import module from "node:module";

module.enableCompileCache();
await import("./index");

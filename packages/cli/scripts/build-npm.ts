#!/usr/bin/env bun

// Builds the npm package's bundle for Node: `dist/nipa.js`, which turns on
// Node's compile cache, and the chunks it loads in `dist/chunks/`. Pass a
// folder to build there in place of `dist/`.

import { rm } from "node:fs/promises";
import path from "node:path";

const root = path.join(import.meta.dir, "..");
const outdir = path.resolve(process.argv[2] ?? path.join(root, "dist"));

// Chunk names carry a hash, so a chunk from an older build would ship too.
await rm(path.join(outdir, "chunks"), { force: true, recursive: true });

const result = await Bun.build({
  entrypoints: [path.join(root, "src", "bin.ts")],
  minify: true,
  naming: { chunk: "chunks/[name]-[hash].[ext]", entry: "nipa.js" },
  outdir,
  splitting: true,
  target: "node",
});
if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}
for (const output of result.outputs) {
  console.log(path.relative(root, output.path));
}

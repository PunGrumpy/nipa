#!/usr/bin/env bun

// Serves the test suite's fake Keystone and Space API on a free localhost port
// until SIGTERM, and writes its URL to the file named by the first argument.
// control-nipa.ts starts and stops it.
//
//   bun fake-cloud.ts <url-file>

import { writeFileSync } from "node:fs";

import { startFakeKeystone } from "../../../../test/mocks/keystone";

const urlFile = process.argv.at(2);
if (!urlFile) {
  process.stderr.write("usage: fake-cloud.ts <url-file>\n");
  process.exit(2);
}

const keystone = startFakeKeystone();
writeFileSync(urlFile, keystone.url);

const stop = () => {
  keystone.stop();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

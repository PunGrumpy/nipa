#!/usr/bin/env node
// The npm bundle's entry, src/bin.ts, imports this file, and the compiled
// binary is built from it. With a bun shebang here, `bun build --target=node`
// bundles some modules twice.

import pkg from "../package.json" with { type: "json" };
import { program } from "./commands";
import { createClient } from "./util/client";
import { programSpec } from "./util/command";
import { refreshCompletions } from "./util/completion-install";
import { run } from "./util/dispatch";
import { internalError, toCliError, writeErrorDocument } from "./util/errors";
import { debug } from "./util/http";
import { isJsonMode, printError } from "./util/ui";
import { checkForUpdate } from "./util/update";

// A reader that quits early, as `nipa server ls | head -1` does, closes the
// pipe. The write then fails with EPIPE, which says nothing the reader wants
// to hear, and the command keeps its own exit code.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EPIPE") {
      throw error;
    }
  });
}

try {
  const outcome = await run({
    argv: process.argv.slice(2),
    createClient,
    program,
    version: pkg.version,
  });
  switch (outcome.kind) {
    case "print": {
      console.log(outcome.text);
      process.exitCode = 0;
      break;
    }
    case "ran": {
      process.exitCode = outcome.exitCode;
      if (outcome.updateNotice) {
        await refreshCompletions({
          program: programSpec(program),
          version: pkg.version,
        });
        await checkForUpdate(pkg.version, {
          interactive: outcome.interactive,
        });
      }
      break;
    }
    default: {
      const _exhaustive: never = outcome;
      throw new Error(`unknown outcome ${String(_exhaustive)}`);
    }
  }
} catch (error) {
  const cliError = error instanceof Error ? toCliError(error) : undefined;
  if (isJsonMode()) {
    // A script gets one document either way. A bug has no message worth
    // reading, so it says so in place of a stack, which --debug still shows.
    if (!cliError) {
      debug(
        error instanceof Error ? (error.stack ?? error.message) : `${error}`
      );
    }
    const reported = cliError ?? internalError();
    writeErrorDocument(reported);
    process.exitCode = reported.exitCode;
  } else if (cliError) {
    printError(cliError);
    process.exitCode = cliError.exitCode;
  } else {
    throw error;
  }
}

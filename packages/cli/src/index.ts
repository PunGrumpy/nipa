#!/usr/bin/env node
// npm runs the Node bundle of this file. With a bun shebang here,
// `bun build --target=node` bundles some modules twice.

import pkg from "../package.json" with { type: "json" };
import { program } from "./commands";
import { createClient } from "./util/client";
import { programSpec } from "./util/command";
import { refreshCompletions } from "./util/completion-install";
import { run } from "./util/dispatch";
import { toCliError } from "./util/errors";
import { printError } from "./util/ui";
import { checkForUpdate } from "./util/update";

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
        await checkForUpdate(pkg.version);
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
  if (!cliError) {
    throw error;
  }
  printError(cliError);
  process.exitCode = cliError.exitCode;
}

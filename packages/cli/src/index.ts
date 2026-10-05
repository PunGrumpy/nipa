#!/usr/bin/env node
// npm runs the Node bundle of this file. With a bun shebang here,
// `bun build --target=node` bundles some modules twice.

import pkg from "../package.json" with { type: "json" };
import { program } from "./commands";
import { ApiError } from "./util/api";
import { createClient } from "./util/client";
import { programSpec } from "./util/command";
import { refreshCompletions } from "./util/completion-install";
import { run } from "./util/dispatch";
import { isDebug, NetworkError } from "./util/http";
import { KeystoneError } from "./util/keystone";
import { StoreError } from "./util/store";
import { CliError, printError } from "./util/ui";
import { checkForUpdate } from "./util/update";

const DEBUG_HINT = "Run it again with --debug to see each request.";

const toCliError = (error: Error): CliError | undefined => {
  if (error instanceof CliError) {
    return error;
  }
  if (error instanceof KeystoneError || error instanceof ApiError) {
    const serverSide = error.status === 0 || error.status >= 500;
    return new CliError(error.message, {
      hint: serverSide && !isDebug() ? DEBUG_HINT : undefined,
    });
  }
  if (error instanceof NetworkError) {
    return new CliError(error.message, {
      hint: "Check the Keystone URL with `nipa profile ls`, or your network connection.",
    });
  }
  if (error instanceof StoreError) {
    return new CliError(error.message, {
      hint: "Fix the file, or delete it and run `nipa login` again.",
    });
  }
  return undefined;
};

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

#!/usr/bin/env bun

import pkg from "../package.json" with { type: "json" };
import { program } from "./commands";
import { ApiError } from "./lib/api";
import { isDebug, NetworkError } from "./lib/http";
import { KeystoneError } from "./lib/keystone";
import { StoreError } from "./lib/store";
import { CliError, printError } from "./lib/ui";
import { checkForUpdate } from "./lib/update";
import { createClient } from "./util/client";
import { run } from "./util/dispatch";

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

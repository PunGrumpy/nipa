// The errors nipa's modules throw, turned into the one nipa prints: a
// message, a hint and an exit code. An error that isn't one of them is a
// nipa bug, so the caller lets it crash with its stack.

import { ApiError } from "./api";
import { isDebug, NetworkError } from "./http";
import { KeystoneError } from "./keystone";
import { StoreError } from "./store";
import { CliError } from "./ui";

const DEBUG_HINT = "Run it again with --debug to see each request.";

/** The CliError for a known error, or undefined for one nipa doesn't expect. */
export const toCliError = (error: Error): CliError | undefined => {
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

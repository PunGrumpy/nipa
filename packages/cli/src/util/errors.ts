// The errors nipa's modules throw, turned into the one nipa prints: a
// message, a hint, a reason and an exit code. An error that isn't one of
// them is a nipa bug, so without `--json` the caller lets it crash with its
// stack.

import { ApiError } from "./api";
import { isDebug, NetworkError } from "./http";
import { KeystoneError } from "./keystone";
import { StoreError } from "./store";
import { CliError, writeStderr } from "./ui";
import type { ErrorData } from "./ui";

/**
 * Why a command failed, for a script that must not match English. A code is
 * a contract: add one, never rename or reuse it.
 */
export type Reason =
  | "invalid_arguments"
  | "unknown_option"
  | "unknown_command"
  | "login_required"
  | "token_expired"
  | "not_found"
  | "ambiguous_name"
  | "network_error"
  | "api_error"
  | "invalid_config"
  | "internal_error"
  | "failed";

const DEBUG_HINT = "Run it again with --debug to see each request.";

// Only the Space API's status says what went wrong for certain: Keystone
// answers 401 to a wrong password too, and a 403 has no reason of its own.
const apiReason = (error: KeystoneError | ApiError): Reason => {
  if (error instanceof ApiError && error.status === 401) {
    return "token_expired";
  }
  if (error instanceof ApiError && error.status === 404) {
    return "not_found";
  }
  return "api_error";
};

/** The CliError for a known error, or undefined for one nipa doesn't expect. */
export const toCliError = (error: Error): CliError | undefined => {
  if (error instanceof CliError) {
    return error;
  }
  if (error instanceof KeystoneError || error instanceof ApiError) {
    const serverSide = error.status === 0 || error.status >= 500;
    return new CliError(error.message, {
      hint: serverSide && !isDebug() ? DEBUG_HINT : undefined,
      reason: apiReason(error),
    });
  }
  if (error instanceof NetworkError) {
    return new CliError(error.message, {
      hint: "Check the Keystone URL with `nipa profile ls`, or your network connection.",
      reason: "network_error",
    });
  }
  if (error instanceof StoreError) {
    return new CliError(error.message, {
      hint:
        error.hint ?? "Fix the file, or delete it and run `nipa login` again.",
      reason: "invalid_config",
    });
  }
  return undefined;
};

/** What `--json` writes to stderr when a command fails. */
export interface ErrorDocument {
  message: string;
  reason: Reason;
  status: "action_required" | "error";
  hint?: string;
  next?: { command: string; argv: string[] }[];
  data?: ErrorData;
}

// A person has to act before the command can run: fix the line, name one
// server or log in.
const blockedBeforeAnyEffect = (error: CliError): boolean =>
  error.exitCode === 2 ||
  error.reason === "ambiguous_name" ||
  error.reason === "login_required" ||
  error.reason === "token_expired";

// A recovery command runs in the profile the failed run named, because the
// one `-P` chose isn't the one a bare command would use.
const inProfile = (command: string, profile: string | undefined): string =>
  profile === undefined || command.includes(" -P ")
    ? command
    : command.replace(/^nipa /u, `nipa -P ${profile} `);

/** The machine-readable form of an error. Optional fields appear only when they apply. */
export const jsonErrorDocument = (
  error: CliError,
  profile?: string
): ErrorDocument => {
  const document: ErrorDocument = {
    message: error.message,
    reason: error.reason,
    status: blockedBeforeAnyEffect(error) ? "action_required" : "error",
  };
  // A next says what its hint says, in the profile the run named.
  if (error.hint && !error.next?.length) {
    document.hint = error.hint;
  }
  if (error.data) {
    document.data = error.data;
  }
  if (error.next && error.next.length > 0) {
    document.next = error.next.map((next) => {
      const command = inProfile(next, profile);
      return { argv: command.split(" "), command };
    });
  }
  return document;
};

let profileOption: string | undefined;

/** Records this run's `--profile`, which the error document's `next` keeps. */
export const setProfileOption = (profile: string | undefined): void => {
  profileOption = profile;
};

/** Writes the error document: one line, and always the last on stderr. */
export const writeErrorDocument = (error: CliError): void => {
  writeStderr(JSON.stringify(jsonErrorDocument(error, profileOption)));
};

/** The error document nipa writes for a bug under `--json`, in place of a stack. */
export const internalError = (): CliError =>
  new CliError("Unexpected error in nipa. This is a bug.", {
    reason: "internal_error",
  });

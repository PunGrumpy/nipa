// Output helpers. Everything but command results goes to stderr, so
// `nipa env | source` and `nipa whoami --json | jq` stay clean.

import { isCancel } from "@clack/prompts";
import pc from "picocolors";

export class CliError extends Error {
  readonly hint?: string;
  readonly exitCode: number;

  constructor(
    message: string,
    options: { hint?: string; exitCode?: number } = {}
  ) {
    super(message);
    this.name = "CliError";
    this.hint = options.hint;
    this.exitCode = options.exitCode ?? 1;
  }
}

/** Shared by every prompt: render on stderr, without the clack side bar. */
export const promptOptions = {
  output: process.stderr,
  withGuide: false,
} as const;

export const info = (message: string): void => {
  console.error(`${pc.dim(">")} ${message}`);
};

export const success = (message: string): void => {
  console.error(`${pc.cyan("> Success!")} ${message}`);
};

export const note = (message: string): void => {
  console.error(`${pc.bold(pc.yellow("> NOTE:"))} ${message}`);
};

export const printError = (error: CliError): void => {
  console.error(`${pc.red("Error:")} ${error.message}`);
  if (error.hint) {
    console.error(`${pc.dim(">")} ${error.hint}`);
  }
};

/** Throws on Ctrl-C so callers can treat prompt results as plain values. */
export const answered = <T>(value: T): Exclude<T, symbol> => {
  if (isCancel(value)) {
    throw new CliError("Canceled", { exitCode: 130 });
  }
  // SAFETY: clack prompts resolve to the answer or the cancel symbol, and isCancel ruled out the symbol.
  return value as Exclude<T, symbol>;
};

export const formatDuration = (ms: number): string => {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
};

export const { bold, cyan, dim } = pc;

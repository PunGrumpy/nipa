// Flags more than one command uses, and the global options. Copy a shared
// flag into a spec's `flags`, or spread it to change the description:
// `{ ...yesFlag, description: "Delete it without asking" }`.

import type { FlagSpec, FlagValues } from "./spec";

export const jsonFlag = {
  description: "Print JSON",
  long: "json",
  value: { kind: "none" },
} as const satisfies FlagSpec;

export const yesFlag = {
  description: "Don't ask for confirmation",
  long: "yes",
  short: "y",
  value: { kind: "none" },
} as const satisfies FlagSpec;

export const profileFlag = {
  description: "Use this profile (or set NIPA_PROFILE)",
  long: "profile",
  short: "P",
  value: { kind: "profile" },
} as const satisfies FlagSpec;

export const helpFlag = {
  description: "Show help",
  long: "help",
  short: "h",
  value: { kind: "none" },
} as const satisfies FlagSpec;

/**
 * Options nipa takes before any command, and after any command that isn't a
 * passthrough. The parser, the help pages and the completion scripts read
 * this list. dispatch.ts gives `help` and `version` their meaning, and
 * createClient gives `profile` and `debug` theirs. picocolors reads
 * `--no-color` from process.argv itself.
 */
export const GLOBAL_FLAGS = [
  profileFlag,
  {
    description: "Log each HTTP request (or set NIPA_DEBUG=1)",
    long: "debug",
    short: "d",
    value: { kind: "none" },
  },
  {
    description: "Turn off colors (or set NO_COLOR=1)",
    long: "no-color",
    value: { kind: "none" },
  },
  helpFlag,
  {
    description: "Show the version",
    long: "version",
    short: "v",
    value: { kind: "none" },
  },
] as const satisfies readonly FlagSpec[];

/** `{ profile?: string; debug?: true; "no-color"?: true; help?: true; version?: true }` */
export type GlobalValues = FlagValues<typeof GLOBAL_FLAGS>;

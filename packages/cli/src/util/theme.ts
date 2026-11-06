// Whether to color, decided once per stream. Help goes to stdout and almost
// everything else to stderr, and the two can differ: a pipe on stdout leaves
// stderr on the terminal, and `nipa profile ls 2>log` does the opposite.
// This is the only module that imports picocolors.

import { createColors } from "picocolors";

export type Colors = ReturnType<typeof createColors>;

interface StreamLike {
  isTTY?: boolean;
}

export interface ColorInput {
  /** The words after `nipa`. Only those before `--` can turn colors off. */
  argv: readonly string[];
  env: NodeJS.ProcessEnv;
  stream: StreamLike;
}

const FORCE_OFF = new Set(["0", "false"]);

/**
 * In order: `--no-color`, a nonempty NO_COLOR, FORCE_COLOR (0 and false mean
 * off), then whether this stream is a terminal that can show color. CI says
 * nothing about colors.
 */
export const colorEnabled = (input: ColorInput): boolean => {
  const { argv, env, stream } = input;
  const end = argv.indexOf("--");
  if ((end === -1 ? argv : argv.slice(0, end)).includes("--no-color")) {
    return false;
  }
  if (env.NO_COLOR) {
    return false;
  }
  if (env.FORCE_COLOR) {
    return !FORCE_OFF.has(env.FORCE_COLOR.toLowerCase());
  }
  return stream.isTTY === true && env.TERM !== "dumb";
};

export interface Theme {
  readonly stdout: Colors;
  readonly stderr: Colors;
}

export const createTheme = (input: {
  argv: readonly string[];
  env: NodeJS.ProcessEnv;
  stdout: StreamLike;
  stderr: StreamLike;
}): Theme => {
  const { argv, env } = input;
  return {
    stderr: createColors(colorEnabled({ argv, env, stream: input.stderr })),
    stdout: createColors(colorEnabled({ argv, env, stream: input.stdout })),
  };
};

export const theme: Theme = createTheme({
  argv: process.argv.slice(2),
  env: process.env,
  stderr: process.stderr,
  stdout: process.stdout,
});

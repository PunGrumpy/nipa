// Whether to color, decided once per stream. Help goes to stdout and almost
// everything else to stderr, and the two can differ: a pipe on stdout leaves
// stderr on the terminal, and `nipa profile ls 2>log` does the opposite.
// This is the only module that imports picocolors.

import { createColors } from "picocolors";

type Colors = ReturnType<typeof createColors>;

interface StreamLike {
  isTTY?: boolean;
}

interface ColorInput {
  /** The words after `nipa`. Only those before `--` can turn colors off. */
  argv: readonly string[];
  env: NodeJS.ProcessEnv;
  stream: StreamLike;
  /**
   * Whether FORCE_COLOR may turn color on for a stream that isn't a
   * terminal. It can always turn color off.
   */
  forceMayAdd: boolean;
}

const FORCE_OFF = new Set(["0", "false"]);

/**
 * In order: `--no-color`, a nonempty NO_COLOR, FORCE_COLOR (0 and false mean
 * off), then whether this stream is a terminal that can show color. CI says
 * nothing about colors.
 */
export const colorEnabled = (input: ColorInput): boolean => {
  const { argv, env, forceMayAdd, stream } = input;
  const end = argv.indexOf("--");
  if ((end === -1 ? argv : argv.slice(0, end)).includes("--no-color")) {
    return false;
  }
  if (env.NO_COLOR) {
    return false;
  }
  const terminal = stream.isTTY === true && env.TERM !== "dumb";
  if (env.FORCE_COLOR) {
    const forced = !FORCE_OFF.has(env.FORCE_COLOR.toLowerCase());
    return forceMayAdd ? forced : forced && terminal;
  }
  return terminal;
};

interface Theme {
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
    // Forced color paints what nipa writes to a stderr pipe, but help, the
    // only thing painted for stdout, stays plain in a pipe.
    stderr: createColors(
      colorEnabled({ argv, env, forceMayAdd: true, stream: input.stderr })
    ),
    stdout: createColors(
      colorEnabled({ argv, env, forceMayAdd: false, stream: input.stdout })
    ),
  };
};

export const theme: Theme = createTheme({
  argv: process.argv.slice(2),
  env: process.env,
  stderr: process.stderr,
  stdout: process.stdout,
});

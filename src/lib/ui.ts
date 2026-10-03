// Terminal output and prompts. Everything except a command's result goes to
// stderr, so `nipa env | source` and `nipa whoami --json | jq` read only data.

import { confirm, input, password, select } from "@inquirer/prompts";
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

/** Under a second in milliseconds, then whole seconds: `[278ms]`, `[3s]`. */
export const formatElapsed = (ms: number): string =>
  ms < 1000 ? `${Math.round(ms)}ms` : `${Math.round(ms / 1000)}s`;

/** Hours and minutes left, for token expiry: `23h 59m`, `5m`. */
export const formatDuration = (ms: number): string => {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
};

export const log = (message: string): void => {
  console.error(`${pc.dim(">")} ${message}`);
};

/** `> Success! message [3s]`, with the time the step took when given. */
export const success = (message: string, elapsedMs?: number): void => {
  const time = elapsedMs === undefined ? "" : `[${formatElapsed(elapsedMs)}]`;
  const elapsed = time ? ` ${pc.dim(time)}` : "";
  console.error(`${pc.cyan("> Success!")} ${message}${elapsed}`);
};

export const note = (message: string): void => {
  console.error(`${pc.bold(pc.yellow("> NOTE:"))} ${message}`);
};

export const printError = (error: CliError): void => {
  console.error(`${pc.bold(pc.red("Error:"))} ${error.message}`);
  if (error.hint) {
    console.error(`${pc.dim(">")} ${error.hint}`);
  }
};

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_DELAY_MS = 300;

/**
 * Runs a task with a spinner on stderr. The spinner appears only when the
 * task takes longer than 300 ms, and never when stderr is not a terminal.
 */
export const withSpinner = async <T>(
  message: string,
  task: () => Promise<T>
): Promise<T> => {
  if (!process.stderr.isTTY) {
    return task();
  }
  let frame = 0;
  let drawn = false;
  let interval: ReturnType<typeof setInterval> | undefined;
  const draw = () => {
    drawn = true;
    const symbol = FRAMES[frame % FRAMES.length] ?? "";
    frame += 1;
    process.stderr.write(`\r${pc.dim(symbol)} ${message}`);
  };
  const delay = setTimeout(() => {
    draw();
    interval = setInterval(draw, 80);
  }, SPINNER_DELAY_MS);
  try {
    return await task();
  } finally {
    clearTimeout(delay);
    clearInterval(interval);
    if (drawn) {
      // carriage return, then erase the line
      process.stderr.write("\r\u001B[2K");
    }
  }
};

/** Prompts can run only when a person can answer them. */
export const canPrompt = (): boolean =>
  process.stdin.isTTY === true && process.stderr.isTTY === true;

const promptContext = { output: process.stderr };

/** Turns Ctrl-C in a prompt into a clean exit with code 130. */
const prompt = async <T>(ask: () => Promise<T>): Promise<T> => {
  try {
    return await ask();
  } catch (error) {
    if (error instanceof Error && error.name === "ExitPromptError") {
      throw new CliError("Canceled", { exitCode: 130 });
    }
    throw error;
  }
};

interface TextPrompt {
  message: string;
  default?: string;
  validate?: (value: string) => string | true;
}

export const askText = (options: TextPrompt): Promise<string> =>
  prompt(() => input({ ...options, required: true }, promptContext));

export const askSecret = (message: string): Promise<string> =>
  prompt(() => password({ mask: "*", message }, promptContext));

interface Choice<T> {
  name: string;
  value: T;
  description?: string;
}

export const askChoice = <T>(options: {
  message: string;
  choices: readonly Choice<T>[];
  default?: T;
}): Promise<T> => prompt(() => select(options, promptContext));

export const askConfirm = (options: {
  message: string;
  default: boolean;
}): Promise<boolean> => prompt(() => confirm(options, promptContext));

/** Pads plain-text cells into aligned columns; color is applied after padding. */
export const columns = (rows: readonly (readonly string[])[]): string[][] => {
  const widths: number[] = [];
  for (const row of rows) {
    for (const [index, cell] of row.entries()) {
      widths[index] = Math.max(widths[index] ?? 0, cell.length);
    }
  }
  return rows.map((row) =>
    row.map((cell, index) => cell.padEnd(widths[index] ?? 0))
  );
};

export const { bold, cyan, dim, green } = pc;

// Everything except a command's result goes to stderr, so pipes get only data.

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

export const formatElapsed = (ms: number): string =>
  ms < 1000 ? `${Math.round(ms)}ms` : `${Math.round(ms / 1000)}s`;

export const formatDuration = (ms: number): string => {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
};

// Bun's console.error turns the whole line red on a terminal.
export const writeStderr = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

export const log = (message: string): void => {
  writeStderr(`${pc.dim(">")} ${message}`);
};

export const success = (message: string, elapsedMs?: number): void => {
  const time = elapsedMs === undefined ? "" : `[${formatElapsed(elapsedMs)}]`;
  const elapsed = time ? ` ${pc.dim(time)}` : "";
  writeStderr(`${pc.cyan("> Success!")} ${message}${elapsed}`);
};

export const note = (message: string): void => {
  writeStderr(`${pc.bold(pc.yellow("> NOTE:"))} ${message}`);
};

export const printError = (error: CliError): void => {
  writeStderr(`${pc.bold(pc.red("Error:"))} ${error.message}`);
  if (error.hint) {
    writeStderr(`${pc.dim(">")} ${error.hint}`);
  }
};

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_DELAY_MS = 300;
const ERASE_LINE = "\r\u001B[2K";

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
      process.stderr.write(ERASE_LINE);
    }
  }
};

export const canPrompt = (): boolean =>
  process.stdin.isTTY === true && process.stderr.isTTY === true;

const promptContext = { output: process.stderr };

// inquirer throws ExitPromptError on Ctrl-C.
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

export const { bold, cyan, dim, green } = pc;

export type Paint = (text: string) => string;

/**
 * `paint` colors the cell after padding, so color codes don't count toward
 * the column's width.
 */
export interface Cell {
  text: string;
  paint?: Paint;
}

const COLUMN_GAP = " ".repeat(5);

const heading: Paint = (text) => bold(cyan(text));

/**
 * Prints rows the way the Vercel CLI prints a list: between blank lines, 2
 * spaces in, under bold cyan headings, with columns 5 spaces apart. A mark,
 * such as ✔ for the current profile, replaces a row's first space.
 */
export const printTable = (table: {
  headings: readonly string[];
  rows: readonly (readonly Cell[])[];
  marks?: readonly string[];
}): void => {
  const { headings, marks, rows } = table;
  const widths = headings.map((text, column) =>
    Math.max(text.length, ...rows.map((row) => row[column]?.text.length ?? 0))
  );
  const line = (cells: readonly Cell[]): string =>
    cells
      .map((cell, column) => {
        const last = column === cells.length - 1;
        const text = last ? cell.text : cell.text.padEnd(widths[column] ?? 0);
        return cell.paint ? cell.paint(text) : text;
      })
      .join(COLUMN_GAP);
  writeStderr("");
  writeStderr(`  ${line(headings.map((text) => ({ paint: heading, text })))}`);
  for (const [index, row] of rows.entries()) {
    writeStderr(`${marks?.[index] ?? " "} ${line(row)}`);
  }
  writeStderr("");
};

// Everything except a command's result goes to stderr, so pipes get only data.
// Messages go through log, success, note, withSpinner and printTable, like
// the Vercel CLI's output manager. Results go through the client's stdout,
// and questions through the client's prompts.

import type { Reason } from "./errors";
import { inRun } from "./scope";
import { theme } from "./theme";

// Everything these paint goes to stderr, so stderr decides the colors.
export const { bold, cyan, dim, gray, green, red, yellow } = theme.stderr;

/** What a script reads from a failure. `ids`: the items a name matches. */
export interface ErrorData {
  readonly ids: readonly string[];
}

export class CliError extends Error {
  readonly hint?: string;
  /** Facts a script needs from the failure, such as the IDs a name matches. */
  readonly data?: ErrorData;
  readonly exitCode: number;
  /** The stable code a script reads in place of the message. */
  readonly reason: Reason;
  /** Recovery commands, whole and static, such as `nipa login -P staging`. */
  readonly next?: readonly string[];

  constructor(
    message: string,
    options: {
      hint?: string;
      data?: ErrorData;
      exitCode?: number;
      reason?: Reason;
      next?: readonly string[];
    } = {}
  ) {
    super(message);
    this.name = "CliError";
    this.hint = options.hint;
    this.data = options.data;
    this.exitCode = options.exitCode ?? 1;
    // A wrong command line is exit 2. Any other failure is a generic one
    // until its throw site names a better reason.
    this.reason =
      options.reason ?? (this.exitCode === 2 ? "invalid_arguments" : "failed");
    this.next = options.next;
  }
}

/** Exit code 2: the command line was wrong. The hint says how to write it. */
export const usageError = (
  message: string,
  hint: string,
  reason?: Reason
): CliError => new CliError(message, { exitCode: 2, hint, reason });

export const formatElapsed = (ms: number): string =>
  ms < 1000 ? `${Math.round(ms)}ms` : `${Math.round(ms / 1000)}s`;

const AGE_UNITS = [
  ["d", 86_400_000],
  ["h", 3_600_000],
  ["m", 60_000],
  ["s", 1000],
] as const;

/** Rounds to the largest unit, such as 3d or 45m, like the Vercel CLI. */
export const formatAge = (ms: number): string => {
  const age = Math.max(0, ms);
  for (const [unit, size] of AGE_UNITS) {
    if (age >= size) {
      return `${Math.round(age / size)}${unit}`;
    }
  }
  return `${Math.round(age)}ms`;
};

/** 4096 MB reads as 4 GB, and 1536 MB as 1.5 GB. */
export const gigabytes = (mb: number): string =>
  `${Number((mb / 1024).toFixed(1))} GB`;

/** 1 profile, 2 profiles. */
export const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

/** "active" reads as "Active". */
export const capitalize = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** "a", "a and b", "a, b and c": how dispatch lists subcommands too. */
export const andList = (words: readonly string[]): string => {
  const last = words.at(-1) ?? "";
  const rest = words.slice(0, -1);
  return rest.length === 0 ? last : `${rest.join(", ")} and ${last}`;
};

export const formatDuration = (ms: number): string => {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
};

const ESC = "\u001B";
const BEL = "\u0007";
// The SGR codes behind the bold, dim, red, green, yellow, cyan and gray
// helpers, and the codes that close them. They are the only escape sequences
// nipa writes itself.
const NIPA_SGR = new Set([
  "1m",
  "2m",
  "22m",
  "31m",
  "32m",
  "33m",
  "36m",
  "39m",
  "90m",
]);
const CONTROL_OR_FORMAT = /^[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]$/u;
const isCsiParameter = (char: string): boolean => char >= "0" && char <= "?";
const isIntermediate = (char: string): boolean => char >= " " && char <= "/";
const isFinal = (char: string): boolean => char >= "@" && char <= "~";

const skipWhile = (
  chars: readonly string[],
  from: number,
  test: (char: string) => boolean
): number => {
  let index = from;
  while (index < chars.length && test(chars[index] ?? "")) {
    index += 1;
  }
  return index;
};

// ESC [ parameters intermediates final
const csiEnd = (chars: readonly string[], start: number): number => {
  const intermediates = skipWhile(
    chars,
    skipWhile(chars, start + 2, isCsiParameter),
    isIntermediate
  );
  return isFinal(chars[intermediates] ?? "") ? intermediates + 1 : start + 1;
};

// OSC, DCS, SOS, PM and APC carry a string that ends at BEL or ESC \.
const stringEnd = (chars: readonly string[], start: number): number => {
  for (let index = start + 2; index < chars.length; index += 1) {
    if (chars[index] === BEL) {
      return index + 1;
    }
    if (chars[index] === ESC && chars[index + 1] === "\\") {
      return index + 2;
    }
  }
  return start + 1;
};

// ESC intermediates final, such as ESC c, which resets the terminal.
const shortEnd = (chars: readonly string[], start: number): number => {
  const intermediates = skipWhile(chars, start + 1, isIntermediate);
  return isFinal(chars[intermediates] ?? "") ? intermediates + 1 : start + 1;
};

/** The index after the escape sequence that starts at `start`, or `start + 1` for a bare ESC. */
const escapeEnd = (chars: readonly string[], start: number): number => {
  const kind = chars[start + 1] ?? "";
  if (kind === "[") {
    return csiEnd(chars, start);
  }
  return "]PX^_".includes(kind) && kind !== ""
    ? stringEnd(chars, start)
    : shortEnd(chars, start);
};

interface Keep {
  /** Keep the SGR codes nipa's own helpers write. */
  sgr: boolean;
  newline: boolean;
}

/**
 * Removes what could drive the terminal: control characters, escape
 * sequences of every kind, and format characters such as the bidi overrides
 * and zero-width characters. Marks that combine, such as Thai vowels, stay.
 */
const clean = (text: string, keep: Keep): string => {
  const chars = [...text];
  let out = "";
  let index = 0;
  while (index < chars.length) {
    const char = chars[index] ?? "";
    if (char === ESC) {
      const end = escapeEnd(chars, index);
      const sequence = chars.slice(index, end).join("");
      if (
        keep.sgr &&
        sequence.startsWith(`${ESC}[`) &&
        NIPA_SGR.has(sequence.slice(2))
      ) {
        out += sequence;
      }
      index = end;
    } else {
      if (!CONTROL_OR_FORMAT.test(char) || (keep.newline && char === "\n")) {
        out += char;
      }
      index += 1;
    }
  }
  return out;
};

/**
 * Text that is safe to write to a terminal: nipa's own colors and newlines
 * stay, and everything else that could move the cursor, set the title or
 * hide text is gone. Remote text, such as a resource name, must never reach
 * the terminal any other way.
 */
export const printable = (text: string): string =>
  clean(text, { newline: true, sgr: true });

/**
 * A remote value on one line: \n, \r and \t show as text, and no escape
 * survives. Use it on a value a cell's `paint` captures, because the table
 * only cleans the `text` it passes in.
 */
export const oneLine = (text: string): string =>
  clean(
    text
      .replaceAll("\n", String.raw`\n`)
      .replaceAll("\r", String.raw`\r`)
      .replaceAll("\t", String.raw`\t`),
    { newline: false, sgr: false }
  );

let jsonMode = false;

/**
 * run() decides once per run. In JSON mode stderr carries no progress,
 * receipts, notes or tables, so a failure's error document is its only
 * content. Debug lines are the exception: they ask for themselves.
 */
export const setJsonMode = (on: boolean): void => {
  jsonMode = on;
};

export const isJsonMode = (): boolean => jsonMode;

// Bun's console.error turns the whole line red on a terminal.
export const writeStderr = (line: string): void => {
  process.stderr.write(`${printable(line)}\n`);
};

/** How wide the messages' terminal is, or 80 when nipa can't tell. */
export const stderrWidth = (): number => process.stderr.columns || 80;

export const log = (message: string): void => {
  if (jsonMode) {
    return;
  }
  writeStderr(`${dim(">")} ${inRun(message)}`);
};

export const success = (message: string, elapsedMs?: number): void => {
  if (jsonMode) {
    return;
  }
  const time = elapsedMs === undefined ? "" : `[${formatElapsed(elapsedMs)}]`;
  const elapsed = time ? ` ${dim(time)}` : "";
  writeStderr(`${cyan("> Success!")} ${message}${elapsed}`);
};

export const note = (message: string): void => {
  if (jsonMode) {
    return;
  }
  writeStderr(`${bold(yellow("> NOTE:"))} ${inRun(message)}`);
};

export const printError = (error: CliError): void => {
  writeStderr(`${bold(red("Error:"))} ${error.message}`);
  if (error.hint) {
    writeStderr(`${dim(">")} ${inRun(error.hint)}`);
  }
};

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_DELAY_MS = 300;
const ERASE_LINE = "\r\u001B[2K";

let animating = false;

/** createClient decides once per run, and until it does, nothing animates. */
export const setAnimation = (on: boolean): void => {
  animating = on;
};

export const withSpinner = async <T>(
  message: string,
  task: () => Promise<T>
): Promise<T> => {
  if (!animating || jsonMode) {
    return task();
  }
  let frame = 0;
  let drawn = false;
  let interval: ReturnType<typeof setInterval> | undefined;
  const draw = () => {
    drawn = true;
    const symbol = FRAMES[frame % FRAMES.length] ?? "";
    frame += 1;
    process.stderr.write(
      `\r${dim(symbol)} ${clean(message, { newline: false, sgr: true })}`
    );
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

// inquirer throws ExitPromptError on Ctrl-C. It loads when a prompt asks for
// it: its readline code is a share of the start of every run that never asks.
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
  /** False lets Enter answer with an empty string. */
  required?: boolean;
  validate?: (value: string) => string | true;
}

interface Choice<T> {
  name: string;
  value: T;
  description?: string;
}

interface ChoicePrompt<T> {
  message: string;
  choices: readonly Choice<T>[];
  default?: T;
}

interface ConfirmPrompt {
  message: string;
  default: boolean;
}

/** Questions for the person at the terminal. Each one throws exit 130 on Ctrl-C. */
export interface Prompts {
  /**
   * True when stdin and stderr are terminals and nothing said not to ask:
   * not `--non-interactive`, not `--json`, and no CI variable. Ask only then.
   * Otherwise a command fails with a hint naming the flag or argument to pass.
   */
  readonly interactive: boolean;
  readonly text: (options: TextPrompt) => Promise<string>;
  readonly secret: (message: string) => Promise<string>;
  readonly choice: <T>(options: ChoicePrompt<T>) => Promise<T>;
  readonly confirm: (options: ConfirmPrompt) => Promise<boolean>;
}

// inquirer writes to the stream itself, so a prompt skips writeStderr.
const promptLine = (text: string): string =>
  clean(text, { newline: false, sgr: true });

// inquirer paints with node:util's styleText, which asks stdout about color
// and ignores --no-color. This theme repaints every part the four prompts
// use from the stderr palette, so a prompt follows the same decision as the
// lines around it.
const promptTheme = {
  prefix: { done: green("✔"), idle: theme.stderr.blue("?") },
  spinner: { frames: FRAMES.map((frame) => yellow(frame)), interval: 80 },
  style: {
    answer: cyan,
    defaultAnswer: (text: string) => dim(`(${text})`),
    description: cyan,
    error: (text: string) => red(`> ${text}`),
    help: dim,
    highlight: cyan,
    keysHelpTip: (keys: readonly (readonly [string, string])[]) =>
      keys
        .map(([key, action]) => `${bold(key)} ${dim(action)}`)
        .join(dim(" • ")),
    message: bold,
  },
};

/** The prompts for one run, on these terminal streams. */
export const createPrompts = (streams: {
  stdin: NodeJS.ReadableStream & { isTTY?: boolean };
  stderr: NodeJS.WritableStream & { isTTY?: boolean };
  env: NodeJS.ProcessEnv;
  /** `--non-interactive` was given. */
  nonInteractive: boolean;
  /** The command line asks for `--json`, whose stdout is for a program. */
  json: boolean;
}): Prompts => {
  const context = { input: streams.stdin, output: streams.stderr };
  const refused = streams.nonInteractive || streams.json || !!streams.env.CI;
  const interactive =
    !refused && streams.stdin.isTTY === true && streams.stderr.isTTY === true;
  return {
    choice: (options) =>
      prompt(async () => {
        const { default: select } = await import("@inquirer/select");
        return select(
          {
            ...options,
            choices: options.choices.map((choice) => ({
              ...choice,
              description:
                choice.description === undefined
                  ? undefined
                  : promptLine(choice.description),
              name: promptLine(choice.name),
            })),
            message: promptLine(options.message),
            theme: promptTheme,
          },
          context
        );
      }),
    confirm: (options) =>
      prompt(async () => {
        const { default: confirm } = await import("@inquirer/confirm");
        return confirm(
          {
            ...options,
            message: promptLine(options.message),
            theme: promptTheme,
          },
          context
        );
      }),
    interactive,
    secret: (message) =>
      prompt(async () => {
        const { default: password } = await import("@inquirer/password");
        return password(
          { mask: "*", message: promptLine(message), theme: promptTheme },
          context
        );
      }),
    text: (options) =>
      prompt(async () => {
        const { default: input } = await import("@inquirer/input");
        return input(
          {
            ...options,
            message: promptLine(options.message),
            required: options.required ?? true,
            theme: promptTheme,
          },
          context
        );
      }),
  };
};

/** Where a command's result goes: JSON, IDs, scripts. A pipe gets only this. */
export interface ResultStream {
  /** False in a pipe, where commands print bare data, such as one ID per line. */
  readonly isTTY: boolean;
  /** Writes text as it is. */
  readonly write: (text: string) => void;
  /** Writes text and a newline. */
  readonly line: (text: string) => void;
  /** Writes an object or array as JSON, indented by 2, and a newline. */
  readonly json: <T extends object>(value: T) => void;
}

export const createResultStream = (
  stdout: NodeJS.WriteStream
): ResultStream => ({
  isTTY: stdout.isTTY === true,
  json: (value) => {
    stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  },
  line: (text) => {
    stdout.write(`${text}\n`);
  },
  write: (text) => {
    stdout.write(text);
  },
});

export type Paint = (text: string) => string;

/**
 * `paint` colors the cell after padding, so color codes don't count toward
 * the column's width.
 */
export interface Cell {
  text: string;
  paint?: Paint;
  /** A shorter form for a table that is too wide, such as "(worker)". */
  short?: Cell;
}

/** `text` with a dim `detail` after it, such as "m1.small (2 vCPUs)". */
export const withDetail = (text: string, detail: string): Cell => {
  const safeText = oneLine(text);
  const safeDetail = oneLine(detail);
  return {
    paint: (padded) => `${safeText}${dim(padded.slice(safeText.length))}`,
    text: `${safeText}${safeDetail}`,
  };
};

/** A flavor and its dim size, such as "m1.small (2 vCPUs, 4 GB RAM)". */
export const flavorCell = (sized: {
  flavor: string;
  vcpus: number | null;
  ramMb: number | null;
}): Cell => {
  const size: string[] = [];
  if (sized.vcpus !== null) {
    size.push(plural(sized.vcpus, "vCPU"));
  }
  if (sized.ramMb !== null) {
    size.push(`${gigabytes(sized.ramMb)} RAM`);
  }
  return size.length === 0
    ? { text: sized.flavor }
    : withDetail(sized.flavor, ` (${size.join(", ")})`);
};

const COLUMN_GAP = " ".repeat(5);

// A cell's text is a remote value more often than not. It prints on one line
// and carries no escape, so a name can't forge a row or recolor the screen.
const safeCell = (cell: Cell): Cell => ({
  ...cell,
  short: cell.short && safeCell(cell.short),
  text: oneLine(cell.text),
});

const heading: Paint = (text) => bold(cyan(text));

/**
 * Where a table may give way when the terminal is narrower than it is. Records
 * have no place for a table's `marks`, so don't combine the two.
 */
export interface TableFit {
  /** The terminal's width in columns. */
  width: number;
  /**
   * Indexes of the columns to drop, first to go first. The others are
   * required. The first column names a row and is never droppable.
   */
  droppable: readonly number[];
}

const LEAD = 2;

interface Layout {
  headings: readonly string[];
  rows: readonly (readonly Cell[])[];
}

const columnWidths = ({ headings, rows }: Layout): number[] =>
  headings.map((text, column) =>
    Math.max(text.length, ...rows.map((row) => row[column]?.text.length ?? 0))
  );

const layoutWidth = (layout: Layout): number => {
  const widths = columnWidths(layout);
  return (
    LEAD +
    widths.reduce((sum, width) => sum + width, 0) +
    COLUMN_GAP.length * Math.max(0, widths.length - 1)
  );
};

const keep = (layout: Layout, columns: readonly number[]): Layout => ({
  headings: columns.map((column) => layout.headings[column] ?? ""),
  rows: layout.rows.map((row) =>
    columns.map((column) => row[column] ?? { text: "" })
  ),
});

const shorten = (layout: Layout): Layout => ({
  headings: layout.headings,
  rows: layout.rows.map((row) => row.map((cell) => cell.short ?? cell)),
});

/**
 * The first layout that fits `fit.width`: all columns, then without each
 * droppable column in turn, then with the cells' short forms. Undefined when
 * nothing fits, and the table prints as records. Names, IDs and addresses
 * never truncate.
 */
const fitLayout = (table: Layout, fit: TableFit): Layout | undefined => {
  let kept = table.headings.map((_, column) => column);
  const candidates = [keep(table, kept)];
  for (const column of fit.droppable) {
    kept = kept.filter((index) => index !== column);
    candidates.push(keep(table, kept));
  }
  candidates.push(shorten(candidates.at(-1) ?? table));
  return candidates.find((layout) => layoutWidth(layout) <= fit.width);
};

const painted = (cell: Cell): string => cell.paint?.(cell.text) ?? cell.text;

// One short block per row, for a terminal too narrow for any column layout.
const printRecords = (layout: Layout, droppable: readonly number[]): void => {
  const required = layout.headings
    .map((_, column) => column)
    .filter((column) => column > 0 && !droppable.includes(column));
  writeStderr("");
  for (const row of layout.rows) {
    const [name = { text: "" }] = row;
    writeStderr(`  ${painted(name)}`);
    const details = required.map((column) =>
      painted(row[column] ?? { text: "" })
    );
    writeStderr(`    ${details.join("   ")}`);
  }
  writeStderr("");
};

/**
 * Prints rows the way the Vercel CLI prints a list: between blank lines, 2
 * spaces in, under bold cyan headings, with columns 5 spaces apart. A mark,
 * such as ✔ for the current profile, replaces a row's first space.
 *
 * With `fit`, a table wider than the terminal drops its droppable columns
 * one at a time, then uses its cells' short forms, then prints a record per
 * row: the first column on one line, the required columns indented beneath.
 */
export const printTable = (table: {
  headings: readonly string[];
  rows: readonly (readonly Cell[])[];
  marks?: readonly string[];
  fit?: TableFit;
}): void => {
  if (jsonMode) {
    return;
  }
  const { marks } = table;
  const full: Layout = {
    headings: table.headings,
    rows: table.rows.map((row) => row.map(safeCell)),
  };
  const { fit } = table;
  let fitted = full;
  if (fit) {
    const found = fitLayout(full, fit);
    if (!found) {
      printRecords(shorten(full), fit.droppable);
      return;
    }
    fitted = found;
  }
  const { headings, rows } = fitted;
  const widths = columnWidths(fitted);
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

/**
 * Rows for a pipe: the header, then one line per row, with one tab between
 * fields and no padding. A value that holds a tab, a newline or an escape
 * shows as text, so it can't add a field or a row.
 */
export const tabSeparated = (
  headings: readonly string[],
  rows: readonly (readonly string[])[]
): string =>
  [headings, ...rows]
    .map((fields) => fields.map(oneLine).join("\t"))
    .join("\n");

export interface Field {
  label: string;
  lines: readonly Cell[];
}

/** One resource's details, laid out like `printTable`. */
export const printFields = (given: readonly Field[]): void => {
  if (jsonMode) {
    return;
  }
  const fields = given.map((field) => ({
    ...field,
    lines: field.lines.map(safeCell),
  }));
  const width = Math.max(...fields.map((field) => field.label.length));
  const indent = " ".repeat(2 + width) + COLUMN_GAP;
  writeStderr("");
  for (const { label, lines } of fields) {
    const [first = { text: "-" }, ...rest] = lines;
    const lead = `  ${heading(label.padEnd(width))}${COLUMN_GAP}`;
    writeStderr(`${lead}${painted(first)}`);
    for (const cell of rest) {
      writeStderr(`${indent}${painted(cell)}`);
    }
  }
  writeStderr("");
};

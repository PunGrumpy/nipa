// The values the terminal sessions share. They live outside the component
// files, so Fast Refresh keeps a session's state when one of those changes.

export type Tone = "green" | "amber" | "red" | "gray";

export interface Cell {
  text: string;
  /** Colors the status dot that starts the text. */
  dot?: Tone;
  className?: string;
}

/** A cell of plain text. */
export const text = (value: string): Cell => ({ text: value });

export const active: Cell = { dot: "green", text: "● Active" };

// Keep in step with `terminal-type` in globals.css.
const CHAR_MS = 60;

/** How long a typed command takes, to time the line after it. */
export const typed = (command: string): number =>
  300 + command.length * CHAR_MS;

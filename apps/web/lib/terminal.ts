export type Tone = "green" | "amber" | "red" | "gray";

export interface Cell {
  text: string;

  dot?: Tone;
  className?: string;
}

export const text = (value: string): Cell => ({ text: value });

export const active: Cell = { dot: "green", text: "● Active" };

const CHAR_MS = 60;

export const typed = (command: string): number =>
  300 + command.length * CHAR_MS;

import { describe, expect, test } from "bun:test";
import path from "node:path";

import { colorEnabled, createTheme } from "../../../src/util/theme";

const tty = { isTTY: true };
const pipe = { isTTY: false };

const enabled = (input: {
  argv?: string[];
  env?: NodeJS.ProcessEnv;
  stream?: { isTTY?: boolean };
}) =>
  colorEnabled({
    argv: input.argv ?? [],
    env: input.env ?? {},
    stream: input.stream ?? tty,
  });

describe("colorEnabled", () => {
  test("follows the stream when nothing else speaks", () => {
    expect(enabled({ stream: tty })).toBe(true);
    expect(enabled({ stream: pipe })).toBe(false);
    expect(enabled({ stream: {} })).toBe(false);
  });

  test("a dumb terminal gets none", () => {
    expect(enabled({ env: { TERM: "dumb" } })).toBe(false);
    expect(enabled({ env: { TERM: "xterm-256color" } })).toBe(true);
  });

  test("CI says nothing about colors", () => {
    expect(enabled({ env: { CI: "1" }, stream: tty })).toBe(true);
    expect(enabled({ env: { CI: "1" }, stream: pipe })).toBe(false);
  });

  test("FORCE_COLOR turns colors on for a pipe, and 0 or false turn them off", () => {
    expect(enabled({ env: { FORCE_COLOR: "1" }, stream: pipe })).toBe(true);
    expect(enabled({ env: { FORCE_COLOR: "true" }, stream: pipe })).toBe(true);
    expect(enabled({ env: { FORCE_COLOR: "0" }, stream: tty })).toBe(false);
    expect(enabled({ env: { FORCE_COLOR: "false" }, stream: tty })).toBe(false);
    expect(enabled({ env: { FORCE_COLOR: "" }, stream: tty })).toBe(true);
  });

  test("NO_COLOR beats FORCE_COLOR and the terminal, but only when it has a value", () => {
    expect(
      enabled({ env: { FORCE_COLOR: "1", NO_COLOR: "1" }, stream: tty })
    ).toBe(false);
    expect(enabled({ env: { NO_COLOR: "" }, stream: tty })).toBe(true);
  });

  test("--no-color beats everything", () => {
    expect(
      enabled({
        argv: ["server", "ls", "--no-color"],
        env: { FORCE_COLOR: "1" },
        stream: tty,
      })
    ).toBe(false);
  });

  test("--no-color after -- is an argument, not an option", () => {
    expect(enabled({ argv: ["exec", "--", "ls", "--no-color"] })).toBe(true);
  });
});

const painted = (colors: { bold: (text: string) => string }) =>
  colors.bold("x") !== "x";

describe("createTheme", () => {
  test("each stream decides for itself", () => {
    const piped = createTheme({
      argv: [],
      env: {},
      stderr: tty,
      stdout: pipe,
    });
    expect(painted(piped.stdout)).toBe(false);
    expect(painted(piped.stderr)).toBe(true);

    const redirected = createTheme({
      argv: [],
      env: {},
      stderr: pipe,
      stdout: tty,
    });
    expect(painted(redirected.stdout)).toBe(true);
    expect(painted(redirected.stderr)).toBe(false);
  });
});

describe("the source", () => {
  const SRC = path.join(import.meta.dir, "../../../src");

  test("imports picocolors only in theme.ts", async () => {
    const files = await Array.fromAsync(new Bun.Glob("**/*.ts").scan(SRC));
    const sources = await Promise.all(
      files.map(async (file) => ({
        file,
        text: await Bun.file(path.join(SRC, file)).text(),
      }))
    );
    const importing = sources
      .filter(({ text }) => /from "picocolors"/u.test(text))
      .map(({ file }) => file);
    expect(importing).toEqual([path.join("util", "theme.ts")]);
  });
});

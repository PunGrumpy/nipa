import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { program } from "../../../src/commands";
import type { GlobalValues } from "../../../src/util/arg-common";
import { createClient } from "../../../src/util/client";
import { programSpec } from "../../../src/util/command";
import { setAnimation, withSpinner } from "../../../src/util/ui";

// What a run does once createClient has read the command line: whether a
// task slower than the spinner's delay draws frames on stderr.
describe("whether a run animates", () => {
  const savedEnv = { CI: process.env.CI, TERM: process.env.TERM };
  const tty = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
  let written: string[];
  let spy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    written = [];
    spy = spyOn(process.stderr, "write").mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
    Reflect.deleteProperty(process.env, "CI");
    process.env.TERM = "xterm-256color";
    Object.defineProperty(process.stderr, "isTTY", {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    spy.mockRestore();
    setAnimation(false);
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        Reflect.deleteProperty(process.env, name);
      } else {
        process.env[name] = value;
      }
    }
    if (tty) {
      Object.defineProperty(process.stderr, "isTTY", tty);
    } else {
      Reflect.deleteProperty(process.stderr, "isTTY");
    }
  });

  const drawn = async (input: { globals?: GlobalValues; json?: boolean }) => {
    createClient({
      globals: input.globals ?? {},
      json: input.json ?? false,
      program: programSpec(program),
    });
    await withSpinner("Loading", () => Bun.sleep(400));
    return written.some((chunk) => chunk.includes("Loading"));
  };

  test("draws frames for a person at a terminal", async () => {
    expect(await drawn({})).toBe(true);
  });

  test("a stdin that isn't a terminal doesn't stop it", async () => {
    const stdin = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: false,
    });
    try {
      expect(await drawn({})).toBe(true);
    } finally {
      if (stdin) {
        Object.defineProperty(process.stdin, "isTTY", stdin);
      } else {
        Reflect.deleteProperty(process.stdin, "isTTY");
      }
    }
  });

  test("a stderr that isn't a terminal draws nothing", async () => {
    Object.defineProperty(process.stderr, "isTTY", {
      configurable: true,
      value: false,
    });
    expect(await drawn({})).toBe(false);
  });

  test("--json draws nothing", async () => {
    expect(await drawn({ json: true })).toBe(false);
  });

  test("--non-interactive draws nothing", async () => {
    expect(await drawn({ globals: { "non-interactive": true } })).toBe(false);
  });

  test("CI draws nothing", async () => {
    process.env.CI = "1";
    expect(await drawn({})).toBe(false);
  });

  test("TERM=dumb draws nothing", async () => {
    process.env.TERM = "dumb";
    expect(await drawn({})).toBe(false);
  });
});

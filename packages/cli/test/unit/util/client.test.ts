import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { program } from "../../../src/commands";
import type { GlobalValues } from "../../../src/util/arg-common";
import { createClient } from "../../../src/util/client";
import { programSpec } from "../../../src/util/command";
import { setAnimation, withSpinner } from "../../../src/util/ui";

const setTerminal = (name: "stderr" | "stdin", value: boolean) => {
  Object.defineProperty(process[name], "isTTY", {
    configurable: true,
    value,
  });
};

// What a run does once createClient has read the command line: whether a
// task slower than the spinner's delay draws frames on stderr.
describe("whether a run animates", () => {
  const savedEnv = {
    CI: process.env.CI,
    NO_COLOR: process.env.NO_COLOR,
    TERM: process.env.TERM,
  };
  const ttys = {
    stderr: Object.getOwnPropertyDescriptor(process.stderr, "isTTY"),
    stdin: Object.getOwnPropertyDescriptor(process.stdin, "isTTY"),
  };
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
    setTerminal("stderr", true);
    setTerminal("stdin", true);
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
    for (const name of ["stderr", "stdin"] as const) {
      const tty = ttys[name];
      if (tty) {
        Object.defineProperty(process[name], "isTTY", tty);
      } else {
        Reflect.deleteProperty(process[name], "isTTY");
      }
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

  test("a stdin that isn't a terminal draws nothing", async () => {
    setTerminal("stdin", false);
    expect(await drawn({})).toBe(false);
  });

  test("NO_COLOR removes color, not the frames", async () => {
    process.env.NO_COLOR = "1";
    expect(await drawn({})).toBe(true);
  });

  test("a stderr that isn't a terminal draws nothing", async () => {
    setTerminal("stderr", false);
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

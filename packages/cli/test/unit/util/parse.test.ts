import { describe, expect, test } from "bun:test";

import { defineCommand } from "../../../src/util/command";
import {
  asksForHelp,
  asksForVersion,
  parseLeaf,
  takeGlobals,
} from "../../../src/util/parse";
import { CliError } from "../../../src/util/ui";

describe("asksForVersion", () => {
  test.each([
    [["--version"]],
    [["-v"]],
    [["web", "-y", "-v"]],
    [["--bogus", "-v"]],
    [["web", "extra", "--version"]],
    [["-yv"]],
    [["-vy"]],
    [["-dvy"]],
  ])("%j asks for the version", (words) => {
    expect(asksForVersion(words)).toBe(true);
  });

  test.each([
    [[]],
    [["web"]],
    [["--verbose"]],
    [["--ver"]],
    [["--version=1"]],
    [["-y"]],
    [["v"]],
    [["web", "--", "-v"]],
    [["--", "--version"]],
    [["-n5"]],
    [["-1v"]],
  ])("%j does not", (words) => {
    expect(asksForVersion(words)).toBe(false);
  });

  test("it reads a cluster the way asksForHelp does", () => {
    expect(asksForHelp(["-yh"])).toBe(true);
    expect(asksForVersion(["-yh"])).toBe(false);
    expect(asksForVersion(["-yv"])).toBe(true);
    expect(asksForHelp(["-yv"])).toBe(false);
  });
});

const failure = (run: () => void): CliError => {
  try {
    run();
  } catch (error) {
    if (error instanceof CliError) {
      return error;
    }
    throw error;
  }
  throw new Error("no error");
};

describe("an unknown option", () => {
  const spec = defineCommand({
    args: [],
    flags: [
      { description: "j", long: "json", value: { kind: "none" } },
      { description: "s", long: "status", value: { kind: "text", name: "s" } },
    ],
    name: "ls",
    summary: "ls",
  });
  const parse = (...words: string[]) =>
    failure(() => parseLeaf({ path: [spec], spec, words }));

  test("a close long option is suggested, in the hint and in data", () => {
    const error = parse("--jsno");
    expect(error).toMatchObject({
      data: { suggestion: "--json" },
      exitCode: 2,
      hint: "Did you mean `--json`?",
      message: 'unknown option "--jsno"',
      reason: "unknown_option",
    });
    expect(error.hint).not.toContain("--help");
  });
  test("a value after = is left out of the word compared", () => {
    expect(parse("--statu=x").hint).toBe("Did you mean `--status`?");
    expect(parse("--JSON").hint).toBe("Did you mean `--json`?");
  });
  test("a global option counts at the command too", () => {
    expect(parse("--profil", "x").hint).toBe("Did you mean `--profile`?");
  });
  test("a far option keeps the hint that points at help", () => {
    const error = parse("--zzz");
    expect(error.hint).toBe("Run `nipa ls --help` to see the options.");
    expect(error.data).toBeUndefined();
    expect(error.reason).toBe("unknown_option");
  });
  test("a short option keeps the hint that points at help", () => {
    const error = parse("-x");
    expect(error.hint).toBe("Run `nipa ls --help` to see the options.");
    expect(error.data).toBeUndefined();
  });
  test("an option before the command is compared with the global ones", () => {
    const error = failure(() =>
      takeGlobals({ unknown: "reject", words: ["--debgu", "ls"] })
    );
    expect(error).toMatchObject({
      data: { suggestion: "--debug" },
      hint: "Did you mean `--debug`?",
    });
    // --json is no global option, so it isn't suggested before the command.
    expect(
      failure(() => takeGlobals({ unknown: "reject", words: ["--jsno"] })).hint
    ).toBe("Run `nipa --help` to see the options.");
  });
});

describe("an unknown choice", () => {
  const shells = ["bash", "zsh", "fish", "pwsh"] as const;
  const spec = defineCommand({
    args: [
      {
        arity: "optional",
        name: "shell",
        value: { choices: shells, kind: "choice" },
      },
    ],
    flags: [
      {
        description: "o",
        long: "output",
        value: { choices: ["table", "json"], kind: "choice" },
      },
    ],
    name: "completion",
    summary: "completion",
  });
  const parse = (...words: string[]) =>
    failure(() => parseLeaf({ path: [spec], spec, words }));

  test("a close argument is suggested, in the hint and in data", () => {
    expect(parse("fihs")).toMatchObject({
      data: { suggestion: "fish" },
      exitCode: 2,
      hint: "Did you mean `fish`? Use one of: bash, zsh, fish, pwsh.",
      message: 'unknown shell "fihs"',
      reason: "invalid_arguments",
    });
  });
  test("a close option value is suggested, after a space or after =", () => {
    const hint = "Did you mean `table`? Use one of: table, json.";
    expect(parse("--output", "tabel")).toMatchObject({
      data: { suggestion: "table" },
      hint,
      message: 'unknown output "tabel"',
    });
    expect(parse("--output=tabel").hint).toBe(hint);
  });
  test("a value far from every choice gets only the list", () => {
    const error = parse("xyz");
    expect(error.hint).toBe("Use one of: bash, zsh, fish, pwsh.");
    expect(error.data).toBeUndefined();
  });
  test("a value as close to two choices gets only the list", () => {
    // fsh is one edit from fish and one from zsh.
    const error = parse("fsh");
    expect(error.hint).toBe("Use one of: bash, zsh, fish, pwsh.");
    expect(error.data).toBeUndefined();
  });
});

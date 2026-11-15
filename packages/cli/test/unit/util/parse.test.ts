import { describe, expect, test } from "bun:test";

import { asksForHelp, asksForVersion } from "../../../src/util/parse";

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

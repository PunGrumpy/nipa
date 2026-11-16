import { describe, expect, test } from "bun:test";

import { lastLines } from "../../../src/util/compute";

describe("lastLines", () => {
  const log = "a\nb\nc\n";

  test("returns the last lines, each ending in a newline", () => {
    expect(lastLines(log, 2)).toBe("b\nc\n");
  });

  test("returns every line when the count exceeds the log", () => {
    expect(lastLines(log, 10)).toBe(log);
  });

  test("returns nothing for a count of 0", () => {
    expect(lastLines(log, 0)).toBe("");
  });
});

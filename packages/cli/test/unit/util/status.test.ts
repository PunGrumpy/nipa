import { describe, expect, test } from "bun:test";

import { statusCell, statusLabel } from "../../../src/util/status";

describe("statusLabel", () => {
  test.each([
    ["ACTIVE", "Active"],
    ["HARD_REBOOT", "Hard reboot"],
    ["SHELVED_OFFLOADED", "Shelved offloaded"],
    ["in-use", "In use"],
    ["error_deleting", "Error deleting"],
  ])("%s -> %s", (status, label) => {
    expect(statusLabel(status)).toBe(label);
  });
});

describe("statusCell", () => {
  test("keeps the label when colors are off", () => {
    expect(statusCell("PENDING_CREATE").text).toBe("● Pending create");
  });
});

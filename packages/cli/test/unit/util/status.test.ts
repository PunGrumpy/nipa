import { describe, expect, test } from "bun:test";

import { isFailing, statusCell, statusLabel } from "../../../src/util/status";

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

describe("isFailing", () => {
  test.each(["FAILED", "DELETE_FAILED", "ERROR", "error_deleting", "OFFLINE"])(
    "%s has failed",
    (status) => {
      expect(isFailing(status)).toBe(true);
    }
  );

  test.each(["ACTIVE", "BUILDING", "COMPLETED", "SHUTOFF", "RESTORED"])(
    "%s hasn't",
    (status) => {
      expect(isFailing(status)).toBe(false);
    }
  );
});

describe("statusCell", () => {
  test("keeps the label when colors are off", () => {
    expect(statusCell("PENDING_CREATE").text).toBe("● Pending create");
  });
});

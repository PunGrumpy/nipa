import { describe, expect, test } from "bun:test";

import {
  formatAmount,
  formatPercent,
  groupLabel,
  levelOf,
  quotaLabel,
  sortQuotas,
  summarize,
} from "../../../../src/commands/quota/format";
import type { Level } from "../../../../src/commands/quota/format";
import type { Quota } from "../../../../src/util/quota";

const quota = (
  name: string,
  used: number,
  limit: number | null,
  group = "compute"
): Quota => ({
  group,
  limit,
  name,
  unit: null,
  unlimited: limit === null,
  used,
});

describe("labels", () => {
  test.each([
    ["compute", "cores", "Compute", "vCPUs"],
    ["sqlDatabase", "ram", "Databases", "RAM"],
    ["fileStorage", "share_snapshots", "File storage", "Share snapshots"],
    ["compute", "serverGroups", "Compute", "Server groups"],
  ])("%s/%s reads as %s, %s", (group, name, groupText, nameText) => {
    expect(groupLabel(group)).toBe(groupText);
    expect(quotaLabel(quota(name, 0, 1, group))).toBe(nameText);
  });
});

describe("sortQuotas", () => {
  test("puts known groups and names in table order, then unknown ones as sent", () => {
    const sorted = sortQuotas([
      quota("zeta", 0, 1, "later"),
      quota("port", 0, null, "network"),
      quota("ram", 0, 1),
      quota("alpha", 0, 1, "later"),
      quota("extra", 0, 1),
      quota("instances", 0, 1),
    ]);
    expect(sorted.map((q) => `${q.group}/${q.name}`)).toEqual([
      "compute/instances",
      "compute/ram",
      "compute/extra",
      "network/port",
      "later/zeta",
      "later/alpha",
    ]);
  });
});

describe("formatAmount", () => {
  test.each([
    [18, null, "18"],
    [45_056, "MB", "44 GB"],
    [230, "GB", "230 GB"],
    [1_755_585, "Bytes", "1.7 MB"],
    [0, "Bytes", "0 B"],
    [3, "M", "3 M"],
  ])("%d %s -> %s", (amount, unit, text) => {
    expect(formatAmount(amount, unit)).toBe(text);
  });
});

describe("levelOf and formatPercent", () => {
  test.each<[Quota, Level, string]>([
    [quota("cores", 15, 20), "ok", "75%"],
    [quota("cores", 16, 20), "near", "80%"],
    [quota("cores", 199, 200), "near", "99%"],
    [quota("cores", 29, 50), "ok", "58%"],
    [quota("cores", 29, 100), "ok", "29%"],
    [quota("cores", 57, 100), "ok", "57%"],
    [quota("cores", 58, 100), "ok", "58%"],
    [quota("cores", 20, 20), "full", "100%"],
    [quota("cores", 24, 20), "full", "120%"],
    [quota("cores", 0, 0), "full", "100%"],
    [quota("port", 900, null), "ok", "-"],
  ])("%o is %s at %s", (q, level, percent) => {
    expect(levelOf(q)).toBe(level);
    expect(formatPercent(q)).toBe(percent);
  });
});

describe("summarize", () => {
  const full = quota("instances", 10, 10);
  const near = quota("cores", 18, 20);
  const ok = quota("ram", 1, 20);

  test.each([
    [[ok], null],
    [[near, ok], "1 quota is near the limit."],
    [[near, near], "2 quotas are near the limit."],
    [[full], "1 quota is at the limit."],
    [[full, full, near], "2 quotas are at the limit, and 1 is near it."],
  ])("%#", (quotas, text) => {
    expect(summarize(quotas)).toBe(text);
  });
});

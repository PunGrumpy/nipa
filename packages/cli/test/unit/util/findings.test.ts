import { describe, expect, test } from "bun:test";

import { program } from "../../../src/commands";
import { programSpec } from "../../../src/util/command";
import {
  finding,
  judge,
  nextCommand,
  quotaFindings,
  readFailures,
  readOf,
  scopeFindings,
} from "../../../src/util/findings";
import type { Check, QuotaRef } from "../../../src/util/findings";
import type { Quota } from "../../../src/util/quota";

const quota = (name: string, used: number, limit: number | null): Quota => ({
  group: "compute",
  limit,
  name,
  unit: name === "ram" ? "MB" : null,
  used,
});

const REFS: QuotaRef[] = [
  { group: "compute", label: "servers", name: "instances" },
  { group: "compute", label: "vCPUs", name: "cores" },
  { group: "compute", label: "MB of RAM", name: "ram" },
];

describe("judge", () => {
  test("puts problems first, then warnings, then passes, keeping check order", () => {
    const checks: Check<number>[] = [
      () => [finding("ok", "a", "A passed")],
      () => [finding("warning", "b", "B warned")],
      (n) => [finding("problem", "c", `C failed ${n}`)],
      () => [finding("problem", "d", "D failed")],
    ];
    expect(judge(checks, 1).map((f) => f.check)).toEqual(["c", "d", "b", "a"]);
  });

  test("a check that finds nothing adds nothing", () => {
    expect(judge([() => []], null)).toEqual([]);
  });
});

describe("readOf and readFailures", () => {
  test("a rejected read becomes a warning with its reason", async () => {
    const [good, bad] = await Promise.allSettled([
      Promise.resolve(1),
      Promise.reject(new Error("Service Unavailable")),
    ]);
    const reads = [
      ["the state", readOf(good)],
      ["the console log", readOf(bad)],
    ] as const;
    expect(readFailures(reads)).toEqual([
      {
        check: "read",
        evidence: ["error: Service Unavailable"],
        next: [],
        severity: "warning",
        summary: "nipa couldn't read the console log",
      },
    ]);
  });
});

describe("quotaFindings", () => {
  test("says nothing about quotas below 90% or without a limit", () => {
    const quotas = [quota("instances", 8, 10), quota("cores", 100, null)];
    expect(quotaFindings({ failedCreate: true, quotas, refs: REFS })).toEqual(
      []
    );
  });

  test("a quota at its limit is a problem when a create failed", () => {
    const [found] = quotaFindings({
      failedCreate: true,
      quotas: [quota("instances", 10, 10)],
      refs: REFS,
    });
    expect(found).toEqual({
      check: "quota",
      evidence: ["quota compute/instances: 10 of 10"],
      next: [{ argv: ["nipa", "quota", "ls"], command: "nipa quota ls" }],
      severity: "problem",
      summary:
        "The project uses 10 of its 10 servers, so one more fails to create",
    });
  });

  test("a quota at its limit is only a warning when no create failed", () => {
    const found = quotaFindings({
      failedCreate: false,
      quotas: [quota("instances", 10, 10)],
      refs: REFS,
    });
    expect(found.map((f) => f.severity)).toEqual(["warning"]);
  });

  test("a quota at 90% or more is a warning that names its unit", () => {
    const found = quotaFindings({
      failedCreate: true,
      quotas: [quota("cores", 18, 20), quota("ram", 46_080, 51_200)],
      refs: REFS,
    });
    expect(found.map((f) => [f.severity, f.summary, f.evidence])).toEqual([
      [
        "warning",
        "The project uses 18 of its 20 vCPUs, near the quota",
        ["quota compute/cores: 18 of 20"],
      ],
      [
        "warning",
        "The project uses 46080 of its 51200 MB of RAM, near the quota",
        ["quota compute/ram: 46080 of 51200 MB"],
      ],
    ]);
  });
});

describe("nextCommand and scopeFindings", () => {
  test("a name with a space stays one argv word and is quoted when printed", () => {
    expect(nextCommand("nipa", "server", "logs", "my web")).toEqual({
      argv: ["nipa", "server", "logs", "my web"],
      command: "nipa server logs 'my web'",
    });
  });

  test("each next runs in the profile and project the run named", () => {
    const scope = {
      profile: "staging",
      program: programSpec(program),
      project: "My Project",
    };
    const [found] = scopeFindings(
      [
        finding("problem", "status", "web-1 is in Error", {
          next: [nextCommand("nipa", "server", "history", "web-1")],
        }),
      ],
      scope
    );
    expect(found?.next).toEqual([
      {
        argv: [
          "nipa",
          "-P",
          "staging",
          "-p",
          "My Project",
          "server",
          "history",
          "web-1",
        ],
        command: "nipa -P staging -p 'My Project' server history web-1",
      },
    ]);
  });
});

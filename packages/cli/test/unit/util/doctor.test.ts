import { describe, expect, test } from "bun:test";

import { doctorCommand } from "../../../src/commands/doctor/command";
import { fail, pass, runChecks, tally, warn } from "../../../src/util/doctor";
import type { Check, CheckReport } from "../../../src/util/doctor";
import { NetworkError } from "../../../src/util/http";
import { CliError } from "../../../src/util/ui";

type Id = "a" | "b" | "c";

const collect = (
  checks: readonly Check<Id, string>[]
): Promise<CheckReport<Id>[]> => runChecks({ checks, context: "ctx" });

describe("runChecks", () => {
  test("runs each check with the context, in order", async () => {
    const reports = await collect([
      {
        id: "a",
        run: (ctx) => Promise.resolve(pass(`A got ${ctx}`)),
        title: "A",
      },
      {
        id: "b",
        run: () => Promise.resolve(warn("B is old", "Update B.")),
        title: "B",
      },
    ]);
    expect(reports).toEqual([
      { id: "a", status: "pass", summary: "A got ctx", title: "A" },
      {
        hint: "Update B.",
        id: "b",
        status: "warn",
        summary: "B is old",
        title: "B",
      },
    ]);
  });

  test("a check whose need failed skips, and a warning counts as met", async () => {
    let ran = false;
    const reports = await collect([
      {
        id: "a",
        run: () => Promise.resolve(fail("A is down", "Fix A.")),
        title: "A",
      },
      {
        id: "b",
        needs: ["a"],
        run: () => {
          ran = true;
          return Promise.resolve(pass("B ran"));
        },
        title: "B",
      },
      {
        id: "c",
        needs: ["b"],
        run: () => Promise.resolve(pass("C ran")),
        title: "C",
      },
    ]);
    expect(ran).toBe(false);
    expect(reports.map((r) => `${r.status} ${r.summary}`)).toEqual([
      "fail A is down",
      "skip Skipped because A didn't pass",
      "skip Skipped because B didn't pass",
    ]);
    const warned = await collect([
      { id: "a", run: () => Promise.resolve(warn("A is slow")), title: "A" },
      {
        id: "b",
        needs: ["a"],
        run: () => Promise.resolve(pass("B ran")),
        title: "B",
      },
    ]);
    expect(warned.map((r) => r.summary)).toEqual(["A is slow", "B ran"]);
  });

  test("a check sees the results before it", async () => {
    const reports = await collect([
      { id: "a", run: () => Promise.resolve(pass("A")), title: "A" },
      {
        id: "b",
        run: (_ctx, earlier) =>
          Promise.resolve(pass(`A was ${earlier.get("a")?.status}`)),
        title: "B",
      },
    ]);
    expect(reports[1]?.summary).toBe("A was pass");
  });

  test("a check that throws a known error fails with its message and hint, and the rest still run", async () => {
    const reports = await collect([
      {
        id: "a",
        run: () =>
          Promise.reject(new CliError("no profile", { hint: "Add one." })),
        title: "A",
      },
      {
        id: "b",
        run: () =>
          Promise.reject(new NetworkError("https://example.com/v3", "refused")),
        title: "B",
      },
      { id: "c", run: () => Promise.resolve(pass("C ran")), title: "C" },
    ]);
    expect(reports).toEqual([
      {
        hint: "Add one.",
        id: "a",
        status: "fail",
        summary: "No profile",
        title: "A",
      },
      {
        hint: "Check the Keystone URL with `nipa profile ls`, or your network connection.",
        id: "b",
        status: "fail",
        summary: "Can't reach example.com: refused",
        title: "B",
      },
      { id: "c", status: "pass", summary: "C ran", title: "C" },
    ]);
  });

  test("a check that throws an unknown error crashes the run, because that's a nipa bug", async () => {
    const seen: string[] = [];
    const run = runChecks<Id, string>({
      checks: [
        { id: "a", run: () => Promise.resolve(pass("A ran")), title: "A" },
        {
          id: "b",
          run: () => Promise.reject(new TypeError("x is not a function")),
          title: "B",
        },
        { id: "c", run: () => Promise.resolve(pass("C ran")), title: "C" },
      ],
      context: "ctx",
      onReport: (report) => seen.push(report.id),
    });
    await expect(run).rejects.toThrow(TypeError);
    expect(seen).toEqual(["a"]);
  });
});

describe("tally", () => {
  test("counts each status, leaving out the ones no check has", () => {
    expect(tally(["pass", "pass", "warn", "skip", "pass"])).toBe(
      "3 passed, 1 warning, 1 skipped"
    );
    expect(tally(["fail", "warn", "warn", "pass"])).toBe(
      "1 passed, 2 warnings, 1 failed"
    );
  });
});

describe("doctorCommand", () => {
  test("skips the update notice, which would repeat the Update check", () => {
    expect(doctorCommand.updateNotice).toBe(false);
  });
});

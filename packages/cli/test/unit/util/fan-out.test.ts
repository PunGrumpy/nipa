import { describe, expect, test } from "bun:test";
import { setTimeout as delay } from "node:timers/promises";

import { fanOut } from "../../../src/util/fan-out";

const range = (count: number): number[] =>
  Array.from({ length: count }, (_, at) => at);

describe("fanOut", () => {
  test("returns results in the order of the items, whatever order they finish in", async () => {
    const results = await fanOut(
      range(6),
      async (item) => {
        // The first item takes the longest, so it finishes last.
        await delay((6 - item) * 8);
        return item * 10;
      },
      { deadlineMs: 1000, limit: 3 }
    );
    expect(results).toEqual(
      range(6).map((item) => ({ kind: "done", value: item * 10 }))
    );
  });

  test("never runs more tasks at once than the limit, and uses all of it", async () => {
    let inFlight = 0;
    let peak = 0;
    await fanOut(
      range(12),
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await delay(15);
        inFlight -= 1;
      },
      { deadlineMs: 1000, limit: 4 }
    );
    expect(peak).toBe(4);
  });

  test("a task that fails is its own result, and the others still run", async () => {
    const boom = new Error("boom");
    const results = await fanOut(
      [1, 2, 3],
      (item) => (item === 2 ? Promise.reject(boom) : Promise.resolve(item)),
      { deadlineMs: 1000, limit: 2 }
    );
    expect(results).toEqual([
      { kind: "done", value: 1 },
      { error: boom, kind: "failed" },
      { kind: "done", value: 3 },
    ]);
  });

  test("a task that throws before it returns a promise fails the same way", async () => {
    const results = await fanOut(
      [1],
      () => {
        throw new Error("sync");
      },
      { deadlineMs: 1000, limit: 1 }
    );
    expect(results[0]?.kind).toBe("failed");
  });

  test("a hung task times out at its deadline and doesn't hold the others back", async () => {
    const started = performance.now();
    const finished = new Map<number, number>();
    let hungSignal: AbortSignal | undefined;
    const results = await fanOut(
      range(7),
      async (item, signal) => {
        if (item === 0) {
          hungSignal = signal;
          try {
            await delay(5000, undefined, { signal });
          } catch {
            // The deadline aborted the wait.
          }
          return item;
        }
        await delay(10);
        finished.set(item, performance.now() - started);
        return item;
      },
      { deadlineMs: 150, limit: 2 }
    );
    expect(results[0]).toEqual({ kind: "timeout" });
    expect(results.slice(1).every((result) => result.kind === "done")).toBe(
      true
    );
    // The six others share the free place and finish before the hung task's deadline.
    expect(finished.size).toBe(6);
    for (const at of finished.values()) {
      expect(at).toBeLessThan(150);
    }
    expect(hungSignal?.aborted).toBe(true);
    expect(performance.now() - started).toBeLessThan(400);
  });

  test("a task that ignores its signal can't outlive the deadline", async () => {
    const started = performance.now();
    const [result] = await fanOut([1], () => delay(2000), {
      deadlineMs: 60,
      limit: 1,
    });
    expect(result).toEqual({ kind: "timeout" });
    expect(performance.now() - started).toBeLessThan(500);
  });

  test("the deadline counts from when a task starts, not from when it queues", async () => {
    const results = await fanOut(
      [1, 2, 3],
      async (item) => {
        await delay(60);
        return item;
      },
      { deadlineMs: 100, limit: 1 }
    );
    expect(results.map((result) => result.kind)).toEqual([
      "done",
      "done",
      "done",
    ]);
  });

  test("no items is no work", async () => {
    expect(
      await fanOut([], () => Promise.resolve(1), { deadlineMs: 10, limit: 4 })
    ).toEqual([]);
  });
});

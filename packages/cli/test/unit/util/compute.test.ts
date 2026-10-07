import { describe, expect, test } from "bun:test";

import { waitForServer } from "../../../src/util/compute";
import type { ServerState } from "../../../src/util/compute";
import { fakeSpace } from "../../helpers";

const statesSpace = (states: readonly ServerState[]) => {
  const asked: string[] = [];
  const space = fakeSpace({
    get: (path, schema) => {
      asked.push(path);
      const state = states[Math.min(asked.length, states.length) - 1];
      return Promise.resolve(
        schema.parse({
          instance: {
            locked: state?.locked,
            status: state?.status,
            task_state: state?.taskState,
          },
        })
      );
    },
  });
  return { asked, space };
};

const wait = (states: readonly ServerState[], timeoutMs = 10_000) => {
  const { asked, space } = statesSpace(states);
  let clock = 0;
  const outcome = waitForServer({
    id: "s1",
    intervalMs: 2000,
    now: () => clock,
    sleep: (ms) => {
      clock += ms;
      return Promise.resolve();
    },
    space,
    status: "SHUTOFF",
    timeoutMs,
  });
  return { asked, outcome };
};

describe("waitForServer", () => {
  test("waits for the status and for Nova's task to end", async () => {
    const { asked, outcome } = wait([
      { locked: false, status: "ACTIVE", taskState: "powering-off" },
      { locked: false, status: "SHUTOFF", taskState: "powering-off" },
      { locked: false, status: "SHUTOFF", taskState: null },
    ]);
    expect(await outcome).toEqual({ kind: "done" });
    expect(asked).toEqual([
      "/v4/instances/s1",
      "/v4/instances/s1",
      "/v4/instances/s1",
    ]);
  });

  test("stops at ERROR", async () => {
    const { outcome } = wait([
      { locked: false, status: "ACTIVE", taskState: "powering-off" },
      { locked: false, status: "ERROR", taskState: null },
    ]);
    expect(await outcome).toEqual({ kind: "error" });
  });

  test("gives up after the timeout with the last state", async () => {
    const busy = { locked: false, status: "ACTIVE", taskState: "powering-off" };
    const { asked, outcome } = wait([busy], 4000);
    expect(await outcome).toEqual({ kind: "timeout", state: busy });
    expect(asked).toHaveLength(3);
  });
});

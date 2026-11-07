import { describe, expect, test } from "bun:test";

import { mainAddress, waitForServer } from "../../../src/util/compute";
import type { Address, Server, ServerState } from "../../../src/util/compute";
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

const address = (
  value: string,
  version: Address["version"],
  type: Address["type"] = "fixed"
): Address => ({
  address: value,
  type,
  version,
});

const withAddresses = (addresses: Address[]): Server => ({
  addresses,
  createdAt: "2030-01-01T00:00:00Z",
  flavor: "csa.large.v2",
  id: "s1",
  kubernetes: null,
  name: "web-1",
  ramMb: 4096,
  securityGroups: [],
  status: "ACTIVE",
  vcpus: 2,
  volumes: [],
  zone: null,
});

describe("mainAddress", () => {
  test("a floating IP comes first", () => {
    const server = withAddresses([
      address("192.0.2.5", 4),
      address("203.0.113.10", 4, "floating"),
    ]);
    expect(mainAddress(server)).toBe("203.0.113.10");
  });

  test("then IPv4, then anything", () => {
    const dual = withAddresses([
      address("2001:db8::5", 6),
      address("192.0.2.5", 4),
    ]);
    expect(mainAddress(dual)).toBe("192.0.2.5");
    const v6 = withAddresses([address("2001:db8::5", 6)]);
    expect(mainAddress(v6)).toBe("2001:db8::5");
    expect(mainAddress(withAddresses([]))).toBeUndefined();
  });
});

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

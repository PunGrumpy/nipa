import { describe, expect, test } from "bun:test";

import { mainAddress, nameCell } from "../../../../src/commands/server/format";
import type { Address, Server } from "../../../../src/util/compute";

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
  status: "ACTIVE",
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

describe("nameCell", () => {
  const server = withAddresses([]);

  test("a server people made shows its name", () => {
    expect(nameCell(server)).toEqual({ text: "web-1" });
  });

  test("a Kubernetes node names its role, or node without one", () => {
    const master = {
      ...server,
      kubernetes: { clusterId: "c1", role: "master" },
    };
    expect(nameCell(master).text).toBe("web-1 (Kubernetes master)");
    const node = { ...server, kubernetes: { clusterId: "c1", role: null } };
    expect(nameCell(node).text).toBe("web-1 (Kubernetes node)");
  });
});

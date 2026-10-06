import { describe, expect, test } from "bun:test";

import {
  addressCells,
  flavorCell,
  mainAddress,
  nameCell,
  volumeCells,
} from "../../../../src/commands/server/format";
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

describe("flavorCell", () => {
  const server = withAddresses([]);

  test("names the flavor, then its vCPUs and RAM", () => {
    expect(flavorCell(server).text).toBe("csa.large.v2 (2 vCPUs, 4 GB RAM)");
    const small = { ...server, ramMb: 512, vcpus: 1 };
    expect(flavorCell(small).text).toBe("csa.large.v2 (1 vCPU, 0.5 GB RAM)");
  });

  test("only the name when the Space API leaves out the size", () => {
    const bare = { ...server, ramMb: null, vcpus: null };
    expect(flavorCell(bare)).toEqual({ text: "csa.large.v2" });
  });
});

describe("addressCells", () => {
  test("external addresses first, and marked", () => {
    const server = withAddresses([
      address("192.0.2.5", 4),
      address("203.0.113.10", 4, "floating"),
    ]);
    expect(addressCells(server).map((cell) => cell.text)).toEqual([
      "203.0.113.10 (external)",
      "192.0.2.5",
    ]);
  });
});

describe("volumeCells", () => {
  test("name, size, type and use, or the ID without a name", () => {
    const server = {
      ...withAddresses([]),
      volumes: [
        {
          attachedAs: "boot disk",
          id: "v1",
          name: "web-1-vol-0",
          sizeGb: 10,
          type: "Standard_SSD",
        },
        { attachedAs: null, id: "v2", name: null, sizeGb: 50, type: null },
      ],
    };
    expect(volumeCells(server).map((cell) => cell.text)).toEqual([
      "web-1-vol-0 (10 GB Standard_SSD, boot disk)",
      "v2 (50 GB)",
    ]);
  });
});

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { pipeRows, printServers } from "../../../../src/commands/server/ls";
import type { Server } from "../../../../src/util/compute";

const NOW = Date.parse("2026-11-06T00:00:00Z");

const server = (name: string, over: Partial<Server> = {}): Server => ({
  addresses: [{ address: "203.0.113.10", type: "floating", version: 4 }],
  createdAt: "2026-11-03T00:00:00Z",
  flavor: "csa.large.v2",
  id: `id-${name}`,
  kubernetes: null,
  name,
  ramMb: null,
  securityGroups: [],
  status: "ACTIVE",
  vcpus: null,
  volumes: [],
  zone: null,
  ...over,
});

const node = (name: string, role: string): Server =>
  server(name, { kubernetes: { clusterId: "c", role, version: null } });

const SERVERS = [
  server("web-2"),
  server("web-1"),
  node("payments-prod-k8s-x7f2ab9c-node-0", "worker"),
  node("payments-prod-k8s-x7f2ab9c-master-0", "master"),
];

describe("server ls at the terminal's width", () => {
  let written: string[];
  let spy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    written = [];
    spy = spyOn(process.stderr, "write").mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  const lines = (servers: readonly Server[], width: number): string[] => {
    printServers(servers, NOW, width);
    return Bun.stripANSI(written.join("")).split("\n");
  };

  test("keeps all five columns at 120 columns", () => {
    const out = lines(SERVERS, 120);
    expect(out[1]).toMatch(/Name\s+Status\s+Address\s+Flavor\s+Age$/u);
    expect(out.join("\n")).toContain(
      "payments-prod-k8s-x7f2ab9c-master-0 (Kubernetes master)"
    );
    expect(out.join("\n")).toContain("csa.large.v2");
  });

  test("drops Flavor, then Age, before it shortens a name", () => {
    const noFlavor = lines([server("web-1")], 50);
    expect(noFlavor[1]).toMatch(/Name\s+Status\s+Address\s+Age$/u);
    expect(noFlavor.join("\n")).not.toContain("Flavor");
    written = [];
    const noAge = lines([server("web-1")], 40);
    expect(noAge[1]).toMatch(/Name\s+Status\s+Address$/u);
    expect(noAge.join("\n")).not.toContain("Age");
  });

  test("shortens the Kubernetes role at 80 columns and fits", () => {
    const out = lines(SERVERS, 80);
    const text = out.join("\n");
    expect(out[1]).toMatch(/Name\s+Status\s+Address$/u);
    expect(text).toContain("payments-prod-k8s-x7f2ab9c-master-0 (master)");
    expect(text).not.toContain("Kubernetes");
    expect(text).not.toContain("Flavor");
    for (const line of out) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });

  test("prints a record per server at 60 columns, never cutting a name", () => {
    const out = lines(SERVERS, 60);
    expect(out.join("\n")).not.toMatch(/Name\s+Status/u);
    expect(out).toContain("  payments-prod-k8s-x7f2ab9c-master-0 (master)");
    expect(out).toContain("    ● Active   203.0.113.10");
    expect(out).toContain("  web-1");
    for (const line of out) {
      expect(line.length).toBeLessThanOrEqual(60);
    }
  });

  test("lets one name wider than the terminal run past it", () => {
    const long = "n".repeat(70);
    const out = lines([server(long)], 60);
    expect(out).toContain(`  ${long}`);
    expect(out.filter((line) => line.length > 60)).toEqual([`  ${long}`]);
  });
});

describe("server ls in a pipe", () => {
  test("a server with no address has an empty Address field", () => {
    expect(pipeRows([server("web-1", { addresses: [] })])).toEqual([
      [
        "id-web-1",
        "web-1",
        "Active",
        "",
        "csa.large.v2",
        "2026-11-03T00:00:00.000Z",
      ],
    ]);
  });

  test("a Kubernetes node keeps its bare name", () => {
    expect(pipeRows([node("k8s-master-0", "master")])[0]?.[1]).toBe(
      "k8s-master-0"
    );
  });
});

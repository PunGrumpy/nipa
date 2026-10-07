import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { listClusters } from "../../../src/util/kubernetes";
import { alphaSpace } from "../../helpers";
import { startFakeKeystone } from "../../mocks/keystone";
import type { FakeKeystone } from "../../mocks/keystone";

describe("listClusters", () => {
  let keystone: FakeKeystone;

  beforeAll(() => {
    keystone = startFakeKeystone();
  });

  afterAll(() => {
    keystone.stop();
  });

  test("groups the nodes by cluster, newest cluster first", async () => {
    const clusters = await listClusters(await alphaSpace(keystone.url));
    expect(clusters.map((cluster) => cluster.id)).toEqual([
      "dddd1111-0000-4000-8000-000000000001",
      "dddd2222-0000-4000-8000-000000000002",
    ]);
    expect(clusters[0]).toMatchObject({
      nodes: [
        { name: "k8s-control-plane-1", role: "master", status: "ACTIVE" },
        { name: "k8s-worker-1", role: "worker", status: "ERROR" },
      ],
      version: "1.34.9",
    });
    expect(clusters[1]).toMatchObject({
      nodes: [{ name: "legacy-node-1", role: null }],
      version: null,
    });
  });

  test("a cluster is as old as its oldest node", async () => {
    const [cluster] = await listClusters(await alphaSpace(keystone.url));
    const worker = cluster?.nodes.find((node) => node.role === "worker");
    expect(worker?.name).toBe("k8s-worker-1");
    const ageDays =
      (Date.now() - Date.parse(cluster?.createdAt ?? "")) / 86_400_000;
    expect(Math.round(ageDays)).toBe(61);
  });
});

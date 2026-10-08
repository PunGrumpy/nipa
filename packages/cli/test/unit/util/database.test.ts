import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { inspectDatabase, listDatabases } from "../../../src/util/database";
import { alphaSpace } from "../../helpers";
import { startFakeKeystone } from "../../mocks/keystone";
import type { FakeKeystone } from "../../mocks/keystone";

describe("listDatabases", () => {
  let keystone: FakeKeystone;

  beforeAll(() => {
    keystone = startFakeKeystone();
  });

  afterAll(() => {
    keystone.stop();
  });

  test("reads each cluster's primary, newest first", async () => {
    const databases = await listDatabases(await alphaSpace(keystone.url));
    expect(databases.map((d) => d.name)).toEqual([
      "cache",
      "analytics",
      "orders",
    ]);
    expect(databases[2]?.primary).toEqual({
      address: "192.0.2.20",
      allowedCidrs: ["203.0.113.0/24", "198.51.100.7/32"],
      engine: "mysql",
      externalAddress: "203.0.113.20",
      flavor: "dsa.large.v1",
      health: "HEALTHY",
      healthCheckedAt: expect.any(String),
      id: "eeee1111-0000-4000-8000-000000000001",
      port: 3306,
      ramMb: 4096,
      status: "ACTIVE",
      storageGb: 10,
      vcpus: 2,
      version: "8.0.34",
      zone: "NCP-BKK",
    });
  });

  test("an empty external IP reads as none, and postgresql listens on 5432", async () => {
    const databases = await listDatabases(await alphaSpace(keystone.url));
    expect(databases[1]?.primary).toMatchObject({
      allowedCidrs: [],
      externalAddress: null,
      healthCheckedAt: null,
      port: 5432,
    });
  });

  test("a cluster without a primary yet", async () => {
    const databases = await listDatabases(await alphaSpace(keystone.url));
    expect(databases[0]).toMatchObject({ name: "cache", primary: null });
  });
});

describe("inspectDatabase", () => {
  let keystone: FakeKeystone;

  beforeAll(() => {
    keystone = startFakeKeystone();
  });

  afterAll(() => {
    keystone.stop();
  });

  const load = async (name: string) => {
    const space = await alphaSpace(keystone.url);
    const databases = await listDatabases(space);
    const database = databases.find((d) => d.name === name);
    if (!database) {
      throw new Error(`the fake has no ${name}`);
    }
    return { database, space };
  };

  test("adds the replicas, logs and backups, newest backup first", async () => {
    const { database: orders, space } = await load("orders");
    const before = keystone.requests.length;
    const detail = await inspectDatabase(space, orders);
    expect(keystone.requests.slice(before).toSorted()).toEqual([
      "GET /api/v4/database/backups",
      "GET /api/v4/database/eeee1111-0000-4000-8000-000000000001/logs",
      "GET /api/v4/databases",
    ]);
    expect(detail.replicas).toEqual([
      {
        address: "192.0.2.22",
        health: "HEALTHY",
        id: "eeee1111-0000-4000-8000-000000000002",
        name: "orders-replica-1",
        status: "ACTIVE",
      },
    ]);
    expect(detail.logs).toEqual([
      {
        enabled: false,
        name: "general",
        publishedBytes: 0,
        status: "Disabled",
      },
      {
        enabled: true,
        name: "slow_query",
        publishedBytes: 2_097_152,
        status: "Published",
      },
    ]);
    expect(detail.backups?.map((b) => b.name)).toEqual([
      "orders-nightly-6",
      "orders-nightly-5",
      "orders-nightly-4",
      "orders-nightly-3",
      "orders-nightly-2",
      "orders-nightly-1",
    ]);
    expect(detail.backups?.[0]?.createdAt).toMatch(/Z$/u);
    expect(detail.backups?.[0]).toMatchObject({ sizeGb: 0.19 });
  });

  test("a replica that's still building has no address", async () => {
    const { database: analytics, space } = await load("analytics");
    const detail = await inspectDatabase(space, analytics);
    expect(detail.replicas).toEqual([
      {
        address: null,
        health: "UNKNOWN",
        id: "eeee2222-0000-4000-8000-000000000003",
        name: "analytics-replica-1",
        status: "BUILD",
      },
    ]);
  });

  test("a part whose endpoint fails is null, and the rest still load", async () => {
    const { database: orders, space } = await load("orders");
    keystone.faults.set("GET /api/v4/database/backups", 503);
    try {
      const detail = await inspectDatabase(space, orders);
      expect(detail.backups).toBeNull();
      expect(detail.replicas).toHaveLength(1);
      expect(detail.logs).toHaveLength(2);
    } finally {
      keystone.faults.delete("GET /api/v4/database/backups");
    }
  });

  test("a cluster without a primary asks for nothing more", async () => {
    const { database: cache, space } = await load("cache");
    const before = keystone.requests.length;
    const detail = await inspectDatabase(space, cache);
    expect(detail).toMatchObject({ backups: [], logs: [], replicas: [] });
    expect(keystone.requests.slice(before)).toEqual([]);
  });
});

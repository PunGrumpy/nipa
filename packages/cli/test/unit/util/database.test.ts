import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { listDatabases } from "../../../src/util/database";
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
      engine: "mysql",
      externalAddress: "203.0.113.20",
      flavor: "dsa.large.v1",
      health: "HEALTHY",
      status: "ACTIVE",
      storageGb: 10,
      version: "8.0.34",
    });
    expect(databases[1]?.primary?.externalAddress).toBeNull();
  });

  test("a cluster without a primary yet", async () => {
    const databases = await listDatabases(await alphaSpace(keystone.url));
    expect(databases[0]).toMatchObject({ name: "cache", primary: null });
  });
});

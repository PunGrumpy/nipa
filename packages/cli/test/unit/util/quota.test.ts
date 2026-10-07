import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { listQuotas } from "../../../src/util/quota";
import { alphaSpace } from "../../helpers";
import { startFakeKeystone } from "../../mocks/keystone";
import type { FakeKeystone } from "../../mocks/keystone";

describe("listQuotas", () => {
  let keystone: FakeKeystone;

  beforeAll(() => {
    keystone = startFakeKeystone();
  });

  afterAll(() => {
    keystone.stop();
  });

  test("reads each NDJSON line, with null for an unlimited limit", async () => {
    const quotas = await listQuotas(await alphaSpace(keystone.url));
    expect(quotas.map((q) => `${q.group}/${q.name}`)).toEqual([
      "network/port",
      "compute/cores",
      "fileStorage/shares",
      "compute/ram",
      "objectStorage/storage_size",
      "compute/instances",
    ]);
    expect(quotas[0]).toEqual({
      group: "network",
      limit: null,
      name: "port",
      unit: null,
      used: 11,
    });
    expect(quotas[3]).toMatchObject({
      limit: 51_200,
      unit: "MB",
      used: 45_056,
    });
  });
});

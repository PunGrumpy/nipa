import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { listExternalIps } from "../../../src/util/external-ip";
import { alphaSpace } from "../../helpers";
import { startFakeKeystone } from "../../mocks/keystone";
import type { FakeKeystone } from "../../mocks/keystone";

describe("listExternalIps", () => {
  let keystone: FakeKeystone;

  beforeAll(() => {
    keystone = startFakeKeystone();
  });

  afterAll(() => {
    keystone.stop();
  });

  test("reads each IP and what it forwards to", async () => {
    const ips = await listExternalIps(await alphaSpace(keystone.url));
    expect(ips.map((ip) => ip.address)).toEqual([
      "203.0.113.10",
      "203.0.113.20",
      "203.0.113.99",
      "203.0.113.30",
    ]);
    expect(ips[2]).toEqual({
      address: "203.0.113.99",
      id: "cccc3333-0000-4000-8000-000000000003",
      internalAddress: null,
      name: "spare",
      status: "DOWN",
      zone: "NCP-NON",
    });
  });
});

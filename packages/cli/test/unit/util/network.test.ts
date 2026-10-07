import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { listNetworks } from "../../../src/util/network";
import { alphaSpace } from "../../helpers";
import { startFakeKeystone } from "../../mocks/keystone";
import type { FakeKeystone } from "../../mocks/keystone";

describe("listNetworks", () => {
  let keystone: FakeKeystone;

  beforeAll(() => {
    keystone = startFakeKeystone();
  });

  afterAll(() => {
    keystone.stop();
  });

  test("reads each network, newest first, with a UTC time", async () => {
    const networks = await listNetworks(await alphaSpace(keystone.url));
    expect(networks.map((network) => network.name)).toEqual([
      "default",
      "Standard_Public_IP_Pool_BKK",
    ]);
    expect(networks[0]).toMatchObject({ external: false, zone: "NCP-BKK" });
    const ageDays =
      (Date.now() - Date.parse(networks[1]?.createdAt ?? "")) / 86_400_000;
    expect(ageDays).toBeCloseTo(400, 1);
  });
});

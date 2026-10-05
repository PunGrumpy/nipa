import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { listLoadBalancers } from "../../../src/util/load-balancer";
import { alphaSpace } from "../../helpers";
import { startFakeKeystone } from "../../mocks/keystone";
import type { FakeKeystone } from "../../mocks/keystone";

describe("listLoadBalancers", () => {
  let keystone: FakeKeystone;

  beforeAll(() => {
    keystone = startFakeKeystone();
  });

  afterAll(() => {
    keystone.stop();
  });

  test("reads each load balancer, newest first", async () => {
    const loadBalancers = await listLoadBalancers(
      await alphaSpace(keystone.url)
    );
    expect(loadBalancers.map((lb) => lb.name)).toEqual(["api-lb", "web-lb"]);
    expect(loadBalancers[1]).toMatchObject({
      address: "192.0.2.30",
      health: "ONLINE",
      listeners: 2,
      status: "ACTIVE",
    });
  });
});

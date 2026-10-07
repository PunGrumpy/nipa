import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { diagnose, listLoadBalancers } from "../../../src/util/load-balancer";
import type {
  BackendGroup,
  LoadBalancerDetail,
  Member,
} from "../../../src/util/load-balancer";
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

const ok = { health: "ONLINE", status: "ACTIVE" };

const member = (id: string, health = "ONLINE"): Member => ({
  address: "192.0.2.5",
  backup: false,
  health,
  id,
  name: id,
  port: 80,
  status: "ACTIVE",
  weight: 1,
});

const group = (members: Member[]): BackendGroup => ({
  ...ok,
  algorithm: "ROUND_ROBIN",
  healthCheck: null,
  id: "pool-1",
  members,
  name: "pool",
  protocol: "TCP",
});

const loadBalancer = (
  backendGroups: BackendGroup[],
  listenerStatus = "ACTIVE"
): LoadBalancerDetail => ({
  ...ok,
  address: "192.0.2.30",
  backendGroups,
  createdAt: "2026-10-01T00:00:00Z",
  externalAddress: null,
  flavor: null,
  id: "lb-1",
  listeners: [
    {
      allowedCidrs: [],
      backendGroupId: "pool-1",
      health: "ONLINE",
      id: "listener-1",
      name: "tcp-80",
      port: 80,
      protocol: "TCP",
      status: listenerStatus,
    },
  ],
  name: "lb",
});

describe("diagnose", () => {
  test("a load balancer whose parts all serve is healthy", () => {
    const lb = loadBalancer([group([member("a"), member("b", "NO_MONITOR")])]);
    expect(diagnose(lb)).toEqual({
      healthy: true,
      verdict: "All listeners and members are healthy",
    });
  });

  test("counts the members that are down", () => {
    const members = [member("a"), member("b", "ERROR"), member("c", "OFFLINE")];
    expect(diagnose(loadBalancer([group(members)]))).toEqual({
      healthy: false,
      verdict: "2 of 3 members are down",
    });
  });

  test("names a lone part instead of counting it", () => {
    const lb = loadBalancer([group([])], "PENDING_UPDATE");
    expect(diagnose(lb).verdict).toBe(
      "The listener is unhealthy and the listener has no members to send traffic to"
    );
  });
});

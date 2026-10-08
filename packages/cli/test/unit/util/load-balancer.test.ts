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

const member = (id: string, health = "ONLINE", backup = false): Member => ({
  address: "192.0.2.5",
  backup,
  health,
  id,
  name: id,
  port: 80,
  status: "ACTIVE",
  weight: 1,
});

const group = (members: Member[], health = "ONLINE"): BackendGroup => ({
  algorithm: "ROUND_ROBIN",
  health,
  healthCheck: null,
  id: "pool-1",
  members,
  name: "pool",
  protocol: "TCP",
  status: "ACTIVE",
});

const loadBalancer = (
  backendGroups: BackendGroup[],
  listenerStatus = "ACTIVE",
  health = "ONLINE"
): LoadBalancerDetail => ({
  address: "192.0.2.30",
  backendGroups,
  createdAt: "2026-10-01T00:00:00Z",
  externalAddress: null,
  flavor: null,
  health,
  id: "lb-1",
  listenerDetails: [
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
  status: "ACTIVE",
});

describe("diagnose", () => {
  test("a load balancer whose parts all serve is healthy", () => {
    const lb = loadBalancer([group([member("a"), member("b", "NO_MONITOR")])]);
    expect(diagnose(lb)).toEqual({
      details: [],
      healthy: true,
      verdict: "All listeners and members are healthy",
    });
  });

  test("counts the members that are down", () => {
    const members = [member("a"), member("b", "ERROR"), member("c", "OFFLINE")];
    expect(diagnose(loadBalancer([group(members)]))).toEqual({
      details: [],
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

  test("blames the member, not the group and load balancer it degrades", () => {
    const pool = group([member("a"), member("b", "ERROR")], "DEGRADED");
    const lb = loadBalancer([pool], "ACTIVE", "DEGRADED");
    expect(diagnose(lb)).toEqual({
      details: [],
      healthy: false,
      verdict: "1 of 2 members is down",
    });
  });

  test("blames the group when its members serve", () => {
    const lb = loadBalancer([group([member("a")], "ERROR")]);
    expect(diagnose(lb).verdict).toBe("The backend group is unhealthy");
  });

  test("blames the load balancer only when nothing below explains it", () => {
    const lb = loadBalancer([group([member("a")])], "ACTIVE", "ERROR");
    expect(diagnose(lb)).toEqual({
      details: [],
      healthy: false,
      verdict: "The load balancer is unhealthy",
    });
  });

  test("a load balancer without listeners has only that to say", () => {
    const lb: LoadBalancerDetail = {
      ...loadBalancer([], "ACTIVE", "OFFLINE"),
      listenerDetails: [],
      status: "PENDING_CREATE",
    };
    expect(diagnose(lb).verdict).toBe("The load balancer has no listeners");
  });

  test("a backup member on standby is a detail, not a fault", () => {
    const members = [member("a"), member("b", "OFFLINE", true)];
    expect(diagnose(loadBalancer([group(members)]))).toEqual({
      details: ["Backup member b is offline until the other members go down"],
      healthy: true,
      verdict: "All listeners and members are healthy",
    });
    const draining = [member("a", "ERROR"), member("b", "DRAINING", true)];
    expect(diagnose(loadBalancer([group(draining, "DEGRADED")]))).toEqual({
      details: ["Backup member b is draining until the other members go down"],
      healthy: false,
      verdict: "1 of 2 members is down",
    });
  });

  test("a backup member in ERROR is down like any other", () => {
    const members = [member("a"), member("b", "ERROR", true)];
    expect(diagnose(loadBalancer([group(members)])).verdict).toBe(
      "1 of 2 members is down"
    );
  });
});

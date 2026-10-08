import { z } from "zod";

import type { Space } from "./api";
import { listExternalIps } from "./external-ip";
import { andList, capitalize } from "./ui";

const LoadBalancerSchema = z.object({
  created_at: z.string(),
  id: z.string(),
  // nipa counts them, so their shape doesn't matter.
  listeners: z.array(z.unknown()),
  name: z.string(),
  operating_status: z.string(),
  provisioning_status: z.string(),
  vip_address: z.string(),
});

const LoadBalancersSchema = z.object({
  loadbalancers: z.array(LoadBalancerSchema),
});

export interface LoadBalancer {
  id: string;
  name: string;
  /** Octavia's provisioning status, such as ACTIVE or PENDING_CREATE. */
  status: string;
  /** Octavia's operating status, such as ONLINE or OFFLINE. */
  health: string;
  /** The virtual IP that takes the traffic. */
  address: string;
  listeners: number;
  createdAt: string;
}

const toLoadBalancer = (
  lb: z.infer<typeof LoadBalancerSchema>
): LoadBalancer => ({
  address: lb.vip_address,
  createdAt: lb.created_at,
  health: lb.operating_status,
  id: lb.id,
  listeners: lb.listeners.length,
  name: lb.name,
  status: lb.provisioning_status,
});

/** Every load balancer in the project, newest first. */
export const listLoadBalancers = async (
  space: Space
): Promise<LoadBalancer[]> => {
  const body = await space.get("/v4/loadbalancers", LoadBalancersSchema);
  return body.loadbalancers
    .map(toLoadBalancer)
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
};

// One load balancer, the way `nipa lb inspect` shows it: the load balancer,
// its listeners, and its backend groups with their members. Octavia gives
// every part two statuses, and a part serves only when both are good.

const PartSchema = z.object({
  id: z.string(),
  operating_status: z.string(),
  provisioning_status: z.string(),
});

const DetailSchema = z.object({
  loadbalancer: PartSchema.extend({
    created_at: z.string(),
    external_ip_id: z.string().nullish(),
    flavor_id: z.string().nullish(),
    name: z.string(),
    vip_address: z.string(),
  }),
});

const ListenersSchema = z.object({
  listeners: z.array(
    PartSchema.extend({
      // Octavia lets every source in when the list is null or empty.
      allowed_cidrs: z.array(z.string()).nullish(),
      backend_group_id: z.string().nullish(),
      name: z.string().nullish(),
      protocol: z.string(),
      protocol_port: z.number(),
    })
  ),
});

const HealthCheckSchema = PartSchema.extend({
  delay: z.number(),
  max_retries: z.number(),
  timeout: z.number(),
  type: z.string(),
});

const BackendGroupsSchema = z.object({
  backend_groups: z.array(
    PartSchema.extend({
      healthcheck: HealthCheckSchema.nullish(),
      lb_algorithm: z.string(),
      name: z.string().nullish(),
      protocol: z.string(),
    })
  ),
});

const MembersSchema = z.object({
  members: z.array(
    PartSchema.extend({
      address: z.string(),
      backup: z.boolean().nullish(),
      name: z.string().nullish(),
      protocol_port: z.number(),
      weight: z.number().nullish(),
    })
  ),
});

const FlavorsSchema = z.object({
  loadbalancer_flavors: z.array(z.object({ id: z.string(), name: z.string() })),
});

/** Octavia's two statuses, which every part of a load balancer has. */
export interface Part {
  id: string;
  /** The provisioning status, such as ACTIVE, PENDING_UPDATE or ERROR. */
  status: string;
  /** The operating status, such as ONLINE, OFFLINE or ERROR. */
  health: string;
}

export interface Member extends Part {
  name: string | null;
  address: string;
  port: number;
  weight: number | null;
  /** Gets traffic only when every other member is down. */
  backup: boolean;
}

export interface HealthCheck extends Part {
  /** How it checks a member, such as TCP, HTTP or PING. */
  type: string;
  delaySeconds: number;
  timeoutSeconds: number;
  /** The checks in a row a member must pass to count as up again. */
  maxRetries: number;
}

export interface BackendGroup extends Part {
  name: string | null;
  protocol: string;
  /** How it spreads traffic, such as ROUND_ROBIN or LEAST_CONNECTIONS. */
  algorithm: string;
  healthCheck: HealthCheck | null;
  members: Member[];
}

export interface Listener extends Part {
  name: string | null;
  protocol: string;
  port: number;
  /** The sources it lets in. Empty lets every source in. */
  allowedCidrs: string[];
  backendGroupId: string | null;
}

export interface LoadBalancerDetail extends Part {
  name: string;
  /** The virtual IP that takes the traffic. */
  address: string;
  /** The external IP that forwards to the virtual IP, if one does. */
  externalAddress: string | null;
  flavor: string | null;
  createdAt: string;
  listeners: Listener[];
  backendGroups: BackendGroup[];
}

const toPart = (part: z.infer<typeof PartSchema>): Part => ({
  health: part.operating_status,
  id: part.id,
  status: part.provisioning_status,
});

const loadMembers = async (space: Space, path: string): Promise<Member[]> => {
  const body = await space.get(`${path}/members`, MembersSchema);
  return body.members.map((member) => ({
    ...toPart(member),
    address: member.address,
    backup: member.backup ?? false,
    name: member.name ?? null,
    port: member.protocol_port,
    weight: member.weight ?? null,
  }));
};

const loadExternalAddress = async (
  space: Space,
  id: string | null | undefined
): Promise<string | null> => {
  if (!id) {
    return null;
  }
  const ips = await listExternalIps(space);
  return ips.find((ip) => ip.id === id)?.address ?? null;
};

const loadFlavorName = async (
  space: Space,
  id: string | null | undefined
): Promise<string | null> => {
  if (!id) {
    return null;
  }
  const { loadbalancer_flavors: flavors } = await space.get(
    "/v4/loadbalancerflavors",
    FlavorsSchema
  );
  return flavors.find((flavor) => flavor.id === id)?.name ?? id;
};

/** The value, or null when the call failed: the labels it feeds can go blank. */
const orNull = <T>(result: PromiseSettledResult<T>): T | null =>
  result.status === "fulfilled" ? result.value : null;

/**
 * One load balancer with its listeners, backend groups and members. The
 * flavor and external IP come from other lists, and only name what the
 * parts already show, so a failure there leaves them null instead of
 * failing the whole command.
 */
export const inspectLoadBalancer = async (
  space: Space,
  id: string
): Promise<LoadBalancerDetail> => {
  const path = `/v4/loadbalancers/${encodeURIComponent(id)}`;
  const [detail, listeners, groups] = await Promise.all([
    space.get(path, DetailSchema),
    space.get(`${path}/listeners`, ListenersSchema),
    space.get(`${path}/backend_groups`, BackendGroupsSchema),
  ]);
  const lb = detail.loadbalancer;
  const [members, labels] = await Promise.all([
    Promise.all(
      groups.backend_groups.map((group) =>
        loadMembers(space, `${path}/backend_groups/${group.id}`)
      )
    ),
    Promise.allSettled([
      loadFlavorName(space, lb.flavor_id),
      loadExternalAddress(space, lb.external_ip_id),
    ]),
  ]);
  const [flavor, externalAddress] = labels;
  return {
    ...toPart(lb),
    address: lb.vip_address,
    backendGroups: groups.backend_groups.map((group, index) => ({
      ...toPart(group),
      algorithm: group.lb_algorithm,
      healthCheck: group.healthcheck
        ? {
            ...toPart(group.healthcheck),
            delaySeconds: group.healthcheck.delay,
            maxRetries: group.healthcheck.max_retries,
            timeoutSeconds: group.healthcheck.timeout,
            type: group.healthcheck.type,
          }
        : null,
      members: members[index] ?? [],
      name: group.name ?? null,
      protocol: group.protocol,
    })),
    createdAt: lb.created_at,
    externalAddress: orNull(externalAddress),
    flavor: orNull(flavor),
    listeners: listeners.listeners.map((listener) => ({
      ...toPart(listener),
      allowedCidrs: listener.allowed_cidrs ?? [],
      backendGroupId: listener.backend_group_id ?? null,
      name: listener.name ?? null,
      port: listener.protocol_port,
      protocol: listener.protocol,
    })),
    name: lb.name,
  };
};

// A member without a health check is NO_MONITOR: nothing checks it, so nipa
// can't call it down.
const SERVING = new Set(["ONLINE", "NO_MONITOR"]);

/** Whether Octavia finished setting the part up and it answers. */
export const isServing = (part: Part): boolean =>
  part.status === "ACTIVE" && SERVING.has(part.health);

/** What a check says of its failing parts, for one part and for several. */
type Predicate = readonly [one: string, many: string];

interface Check {
  noun: readonly [one: string, many: string];
  predicate: Predicate;
  total: number;
  failing: number;
}

const LOAD_BALANCER = ["load balancer", "load balancers"] as const;
const LISTENER = ["listener", "listeners"] as const;
const UNHEALTHY: Predicate = ["is unhealthy", "are unhealthy"];

const failing = (parts: readonly Part[]): number =>
  parts.filter((part) => !isServing(part)).length;

const finding = ({ failing: count, noun, predicate, total }: Check): string => {
  if (total === 1) {
    return `the ${noun[0]} ${predicate[0]}`;
  }
  const [one, many] = predicate;
  return `${count} of ${total} ${noun[1]} ${count === 1 ? one : many}`;
};

export interface Diagnosis {
  healthy: boolean;
  /** One sentence without a final period, such as "2 of 3 members are down". */
  verdict: string;
}

/** Whether the load balancer can serve, and if not, which parts stop it. */
export const diagnose = (lb: LoadBalancerDetail): Diagnosis => {
  const { backendGroups, listeners } = lb;
  const sizes = new Map(backendGroups.map((g) => [g.id, g.members.length]));
  const empty = listeners.filter((l) => !sizes.get(l.backendGroupId ?? ""));
  const healthChecks = backendGroups.flatMap((g) => g.healthCheck ?? []);
  const members = backendGroups.flatMap((g) => g.members);
  const checks: Check[] = [
    {
      failing: failing([lb]),
      noun: LOAD_BALANCER,
      predicate: UNHEALTHY,
      total: 1,
    },
    {
      failing: listeners.length === 0 ? 1 : 0,
      noun: LOAD_BALANCER,
      predicate: ["has no listeners", "have no listeners"],
      total: 1,
    },
    {
      failing: failing(listeners),
      noun: LISTENER,
      predicate: UNHEALTHY,
      total: listeners.length,
    },
    {
      failing: empty.length,
      noun: LISTENER,
      predicate: [
        "has no members to send traffic to",
        "have no members to send traffic to",
      ],
      total: listeners.length,
    },
    {
      failing: failing(backendGroups),
      noun: ["backend group", "backend groups"],
      predicate: UNHEALTHY,
      total: backendGroups.length,
    },
    {
      failing: failing(healthChecks),
      noun: ["health check", "health checks"],
      predicate: UNHEALTHY,
      total: healthChecks.length,
    },
    {
      failing: failing(members),
      noun: ["member", "members"],
      predicate: ["is down", "are down"],
      total: members.length,
    },
  ];
  const findings = checks.filter((check) => check.failing > 0).map(finding);
  if (findings.length === 0) {
    return { healthy: true, verdict: "All listeners and members are healthy" };
  }
  return { healthy: false, verdict: capitalize(andList(findings)) };
};

// A security group rule the way people read it. The table, its order and the
// note about open ports read this model, never the Space API's fields.

import type { SecurityGroupRule } from "../../util/security-group";
import type { Cell } from "../../util/ui";

export type Ports =
  | { kind: "any" }
  | { kind: "range"; from: number; to: number }
  /** Neutron keeps an ICMP rule's type and code in the port fields. */
  | { kind: "icmp"; type: number; code: number | null };

export type Remote =
  | { kind: "any" }
  | { kind: "cidr"; cidr: string }
  | { kind: "group"; id: string; name: string | null };

export interface Rule {
  direction: string;
  /** null for every protocol. */
  protocol: string | null;
  ports: Ports;
  remote: Remote;
  ethertype: string;
}

const ICMP = new Set(["icmp", "icmpv6", "ipv6-icmp"]);
const WORLD = new Set(["0.0.0.0/0", "::/0"]);
const LAST_PORT = 65_535;

const portsOf = (protocol: string | null, rule: SecurityGroupRule): Ports => {
  const { portMax, portMin } = rule;
  if (protocol === null || portMin === null) {
    return { kind: "any" };
  }
  if (ICMP.has(protocol)) {
    return { code: portMax, kind: "icmp", type: portMin };
  }
  const to = portMax ?? portMin;
  return portMin <= 1 && to >= LAST_PORT
    ? { kind: "any" }
    : { from: portMin, kind: "range", to };
};

const remoteOf = (
  rule: SecurityGroupRule,
  groupNames: ReadonlyMap<string, string>
): Remote => {
  if (rule.remoteGroupId) {
    const id = rule.remoteGroupId;
    return { id, kind: "group", name: groupNames.get(id) ?? null };
  }
  return rule.remoteIpPrefix
    ? { cidr: rule.remoteIpPrefix, kind: "cidr" }
    : { kind: "any" };
};

/** `groupNames` maps each security group's ID to its name. */
export const toRule = (
  rule: SecurityGroupRule,
  groupNames: ReadonlyMap<string, string>
): Rule => {
  const protocol =
    rule.protocol === null || rule.protocol === "any" ? null : rule.protocol;
  return {
    direction: rule.direction,
    ethertype: rule.ethertype,
    ports: portsOf(protocol, rule),
    protocol,
    remote: remoteOf(rule, groupNames),
  };
};

const portsText = (ports: Ports): string => {
  switch (ports.kind) {
    case "any": {
      return "any";
    }
    case "range": {
      return ports.from === ports.to
        ? String(ports.from)
        : `${ports.from}-${ports.to}`;
    }
    case "icmp": {
      const code = ports.code === null ? "" : ` code ${ports.code}`;
      return `type ${ports.type}${code}`;
    }
    default: {
      const _exhaustive: never = ports;
      return _exhaustive;
    }
  }
};

const remoteText = (remote: Remote): string => {
  switch (remote.kind) {
    case "any": {
      return "any";
    }
    case "cidr": {
      return remote.cidr;
    }
    case "group": {
      return `group ${remote.name ?? remote.id}`;
    }
    default: {
      const _exhaustive: never = remote;
      return _exhaustive;
    }
  }
};

/** Protocol, ports, remote and ethertype, as one table row. */
export const ruleCells = (rule: Rule): Cell[] => [
  { text: rule.protocol ?? "any" },
  { text: portsText(rule.ports) },
  { text: remoteText(rule.remote) },
  { text: rule.ethertype },
];

const firstPort = (ports: Ports): number => {
  switch (ports.kind) {
    case "range": {
      return ports.from;
    }
    case "icmp": {
      return ports.type;
    }
    default: {
      return -1;
    }
  }
};

/** Rules for every port first, then by port, so port 22 sits near port 80. */
export const compareRules = (a: Rule, b: Rule): number =>
  firstPort(a.ports) - firstPort(b.ports) ||
  (a.protocol ?? "").localeCompare(b.protocol ?? "") ||
  a.ethertype.localeCompare(b.ethertype) ||
  remoteText(a.remote).localeCompare(remoteText(b.remote));

const SENSITIVE_PORTS = [
  { name: "SSH", port: 22 },
  { name: "MySQL", port: 3306 },
  { name: "RDP", port: 3389 },
  { name: "PostgreSQL", port: 5432 },
  { name: "Redis", port: 6379 },
  { name: "MongoDB", port: 27_017 },
] as const;

const isWorld = (remote: Remote): boolean =>
  remote.kind === "any" || (remote.kind === "cidr" && WORLD.has(remote.cidr));

const fromWorld = (rule: Rule): boolean =>
  rule.direction === "ingress" &&
  isWorld(rule.remote) &&
  (rule.protocol === null || rule.protocol === "tcp");

const covers = (ports: Ports, port: number): boolean =>
  ports.kind === "any" ||
  (ports.kind === "range" && ports.from <= port && port <= ports.to);

/** True when anyone on the internet can reach SSH, RDP or a database. */
export const isExposed = (rule: Rule): boolean =>
  fromWorld(rule) &&
  SENSITIVE_PORTS.some(({ port }) => covers(rule.ports, port));

const sentence = (items: readonly string[]): string =>
  items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/** What the exposed rules open to the internet, or undefined for nothing. */
export const exposureNote = (rules: readonly Rule[]): string | undefined => {
  const exposed = rules.filter(isExposed);
  if (exposed.some((rule) => rule.ports.kind === "any")) {
    return "Every port is open to the internet.";
  }
  const services = SENSITIVE_PORTS.filter(({ port }) =>
    exposed.some((rule) => covers(rule.ports, port))
  ).map(({ name, port }) => `${name} (${port})`);
  if (services.length === 0) {
    return undefined;
  }
  const verb = services.length === 1 ? "is" : "are";
  return `${sentence(services)} ${verb} open to the internet.`;
};

import type { Quota } from "../../util/quota";
import { gigabytes, plural, red, yellow } from "../../util/ui";
import type { Paint } from "../../util/ui";

interface GroupLabels {
  label: string;
  /** Each name's label, in the order the table lists them. */
  names: readonly (readonly [name: string, label: string])[];
}

// The table lists the groups in this order, and any group or name nipa
// doesn't know after the ones it does, with a label made from its name.
const GROUPS = new Map<string, GroupLabels>([
  [
    "compute",
    {
      label: "Compute",
      names: [
        ["instances", "Servers"],
        ["cores", "vCPUs"],
        ["ram", "RAM"],
        ["key_pairs", "Key pairs"],
      ],
    },
  ],
  [
    "storage",
    {
      label: "Block storage",
      names: [
        ["volumes", "Volumes"],
        ["volume_size", "Volume size"],
        ["snapshots", "Snapshots"],
        ["backups", "Backups"],
      ],
    },
  ],
  [
    "network",
    {
      label: "Network",
      names: [
        ["network", "Networks"],
        ["router", "Routers"],
        ["port", "Ports"],
        ["floatingip", "External IPs"],
        ["security_group", "Security groups"],
        ["security_group_rule", "Security group rules"],
      ],
    },
  ],
  [
    "loadBalancer",
    {
      label: "Load balancers",
      names: [
        ["load_balancer", "Load balancers"],
        ["listener", "Listeners"],
        ["pool", "Pools"],
      ],
    },
  ],
  [
    "sqlDatabase",
    {
      label: "Databases",
      names: [
        ["database_instances", "Databases"],
        ["ram", "RAM"],
        ["volume_size", "Storage"],
        ["backups", "Backups"],
      ],
    },
  ],
  [
    "container",
    { label: "Kubernetes", names: [["kubernetes_cluster", "Clusters"]] },
  ],
  [
    "objectStorage",
    {
      label: "Object storage",
      names: [
        ["storage_size", "Storage"],
        ["objects", "Objects"],
      ],
    },
  ],
  [
    "internetNatGateway",
    {
      label: "NAT gateways",
      names: [
        ["ing_instance", "Gateways"],
        ["ing_reserved_ip", "Reserved IPs"],
      ],
    },
  ],
]);

const GROUP_ORDER = [...GROUPS.keys()];

const WORD_BREAK = /[_\s]+|(?<=[a-z\d])(?=[A-Z])/u;

/** sqlDatabase reads as "Sql database", and key_pairs as "Key pairs". */
const readable = (id: string): string => {
  const text = id.split(WORD_BREAK).join(" ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const groupLabel = (group: string): string =>
  GROUPS.get(group)?.label ?? readable(group);

const names = (group: string): readonly string[] =>
  GROUPS.get(group)?.names.map(([name]) => name) ?? [];

export const quotaLabel = (quota: Quota): string =>
  GROUPS.get(quota.group)?.names.find(([name]) => name === quota.name)?.[1] ??
  readable(quota.name);

// An unknown group or name ranks last, and a stable sort keeps the Space
// API's order among those.
const rank = (list: readonly string[], item: string): number => {
  const index = list.indexOf(item);
  return index === -1 ? list.length : index;
};

export const sortQuotas = (quotas: readonly Quota[]): Quota[] =>
  quotas.toSorted(
    (a, b) =>
      rank(GROUP_ORDER, a.group) - rank(GROUP_ORDER, b.group) ||
      rank(names(a.group), a.name) - rank(names(b.group), b.name)
  );

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

/** 1755585 bytes reads as 1.7 MB. */
const fromBytes = (bytes: number): string => {
  const step = Math.min(
    BYTE_UNITS.length - 1,
    Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024))
  );
  const size = Number((bytes / 1024 ** step).toFixed(1));
  return `${size} ${BYTE_UNITS[step]}`;
};

// The Space API sends RAM in MB, volumes in GB, and object storage in bytes.
const UNITS = new Map<string, (amount: number) => string>([
  ["Bytes", fromBytes],
  ["GB", (gb) => `${gb} GB`],
  ["MB", gigabytes],
]);

export const formatAmount = (amount: number, unit: string | null): string => {
  if (unit === null) {
    return String(amount);
  }
  return UNITS.get(unit)?.(amount) ?? `${amount} ${unit}`;
};

export type Level = "ok" | "near" | "full";

const NEAR = 0.8;

/** A limit of 0 is full, because the next create fails. */
export const levelOf = (quota: Quota): Level => {
  if (quota.limit === null) {
    return "ok";
  }
  if (quota.used >= quota.limit) {
    return "full";
  }
  return quota.used >= quota.limit * NEAR ? "near" : "ok";
};

export const LEVEL_PAINT: Readonly<Partial<Record<Level, Paint>>> = {
  full: red,
  near: yellow,
};

/** Rounds down, so 99.6% reads as 99% and only a full quota reads 100%. */
export const formatPercent = (quota: Quota): string => {
  if (quota.limit === null) {
    return "-";
  }
  if (quota.limit === 0) {
    return "100%";
  }
  return `${Math.floor((quota.used / quota.limit) * 100)}%`;
};

const is = (count: number): string => (count === 1 ? "is" : "are");

/** The footer, such as "1 quota is at the limit, and 3 are near it." */
export const summarize = (quotas: readonly Quota[]): string | null => {
  const full = quotas.filter((quota) => levelOf(quota) === "full").length;
  const near = quotas.filter((quota) => levelOf(quota) === "near").length;
  if (full > 0 && near > 0) {
    return `${plural(full, "quota")} ${is(full)} at the limit, and ${near} ${is(near)} near it.`;
  }
  if (full > 0) {
    return `${plural(full, "quota")} ${is(full)} at the limit.`;
  }
  if (near > 0) {
    return `${plural(near, "quota")} ${is(near)} near the limit.`;
  }
  return null;
};

/** What a pipe gets: group/name, used and limit, tab-separated. */
export const pipeLine = (quota: Quota): string =>
  [`${quota.group}/${quota.name}`, quota.used, quota.limit ?? "unlimited"].join(
    "\t"
  );

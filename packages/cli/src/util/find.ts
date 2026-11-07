import type { Space } from "./api";
import { listServers, mainAddress } from "./compute";
import type { Server } from "./compute";
import { listDatabases } from "./database";
import type { Database } from "./database";
import { listLoadBalancers } from "./load-balancer";
import type { LoadBalancer } from "./load-balancer";
import { listNetworks } from "./network";
import type { Network } from "./network";
import { listSecurityGroups } from "./security-group";
import type { SecurityGroup } from "./security-group";
import { statusCell } from "./status";
import { CliError, oneLine, withSpinner } from "./ui";
import { listVolumes } from "./volume";
import type { Volume } from "./volume";

interface Named {
  id: string;
  name: string;
}

/** A kind of resource a command names by its name or ID. */
export interface Findable<T extends Named> {
  /** `server`, for `no server named or with ID "x"`. */
  readonly noun: string;
  /** `servers`, for spinners and counts. */
  readonly plural: string;
  /** The command that lists them, such as `nipa server ls`. */
  readonly lsCommand: string;
  readonly list: (space: Space) => Promise<T[]>;
  /**
   * What tells two items of one name apart, such as a status and an address,
   * shown after the ID when a name matches more than one. Plain text: it
   * also goes into the `--json` hint.
   */
  readonly describe?: (item: T) => readonly string[];
}

export const SERVERS: Findable<Server> = {
  describe: (server) => {
    const status = statusCell(server.status).text;
    const address = mainAddress(server);
    return address === undefined ? [status] : [status, address];
  },
  list: listServers,
  lsCommand: "nipa server ls",
  noun: "server",
  plural: "servers",
};

export const VOLUMES: Findable<Volume> = {
  list: listVolumes,
  lsCommand: "nipa volume ls",
  noun: "volume",
  plural: "volumes",
};

export const NETWORKS: Findable<Network> = {
  list: listNetworks,
  lsCommand: "nipa network ls",
  noun: "network",
  plural: "networks",
};

export const SECURITY_GROUPS: Findable<SecurityGroup> = {
  list: listSecurityGroups,
  lsCommand: "nipa sg ls",
  noun: "security group",
  plural: "security groups",
};

export const LOAD_BALANCERS: Findable<LoadBalancer> = {
  list: listLoadBalancers,
  lsCommand: "nipa lb ls",
  noun: "load balancer",
  plural: "load balancers",
};

export const DATABASES: Findable<Database> = {
  list: listDatabases,
  lsCommand: "nipa db ls",
  noun: "database",
  plural: "databases",
};

const MAX_CANDIDATES = 5;

// One line per candidate with its columns aligned, so the IDs can be read and
// copied whole. Every part is remote text and shows on one line.
const candidateLines = <T extends Named>(
  kind: Findable<T>,
  items: readonly T[]
): string[] => {
  const rows = items
    .slice(0, MAX_CANDIDATES)
    .map((item) => [item.id, ...(kind.describe?.(item) ?? [])].map(oneLine));
  const widths = Array.from(
    { length: Math.max(...rows.map((row) => row.length)) },
    (_, column) => Math.max(...rows.map((row) => row[column]?.length ?? 0))
  );
  const lines = rows.map(
    (row) =>
      `    ${row
        .map((cell, column) => cell.padEnd(widths[column] ?? 0))
        .join("  ")
        .trimEnd()}`
  );
  const more = items.length - MAX_CANDIDATES;
  return more > 0
    ? [
        ...lines,
        `    and ${more} more. Run \`${kind.lsCommand}\` to see them all.`,
      ]
    : lines;
};

/** The item whose ID is `ref`, or else the one item named `ref`. */
export const findResource = async <T extends Named>(input: {
  kind: Findable<T>;
  space: Space;
  projectName: string;
  ref: string;
}): Promise<T> => {
  const { kind, projectName, ref } = input;
  const items = await withSpinner(
    `Loading the ${kind.plural} in ${projectName}…`,
    () => kind.list(input.space)
  );
  const byId = items.filter((item) => item.id === ref);
  const [match, ...others] =
    byId.length > 0 ? byId : items.filter((item) => item.name === ref);
  if (!match) {
    throw new CliError(
      `no ${kind.noun} named or with ID "${ref}" in ${projectName}`,
      {
        hint: `Run \`${kind.lsCommand}\` to see your ${kind.plural}.`,
        next: [kind.lsCommand],
        reason: "not_found",
      }
    );
  }
  if (others.length > 0) {
    throw new CliError(
      `${others.length + 1} ${kind.plural} in ${projectName} are named "${ref}"`,
      {
        hint: [
          "Name one by its ID:",
          ...candidateLines(kind, [match, ...others]),
        ].join("\n"),
        reason: "ambiguous_name",
      }
    );
  }
  return match;
};

export const findServer = (input: {
  space: Space;
  projectName: string;
  ref: string;
}): Promise<Server> => findResource({ ...input, kind: SERVERS });

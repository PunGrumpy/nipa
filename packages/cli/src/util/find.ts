import type { Space } from "./api";
import { listServers, mainAddress } from "./compute";
import type { Server } from "./compute";
import { databaseAddress, listDatabases } from "./database";
import type { Database } from "./database";
import { listLoadBalancers } from "./load-balancer";
import type { LoadBalancer } from "./load-balancer";
import { listNetworks } from "./network";
import type { Network } from "./network";
import { runScope, shellQuote } from "./scope";
import { listSecurityGroups } from "./security-group";
import type { SecurityGroup } from "./security-group";
import { statusCell } from "./status";
import { closest } from "./suggest";
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
  /**
   * The command that looks for a name in every project, such as
   * `nipa server search`, for a kind a person often names in the wrong one.
   */
  readonly searchCommand?: string;
  readonly list: (space: Space) => Promise<T[]>;
  /**
   * What tells two items of one name apart, such as a status and an address,
   * shown after the ID when a name matches more than one, in the columns its
   * `ls` shows, so a row can be matched to it.
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
  searchCommand: "nipa server search",
};

export const VOLUMES: Findable<Volume> = {
  describe: (volume) => [statusCell(volume.status).text, `${volume.sizeGb} GB`],
  list: listVolumes,
  lsCommand: "nipa volume ls",
  noun: "volume",
  plural: "volumes",
};

export const NETWORKS: Findable<Network> = {
  describe: (network) => [
    statusCell(network.status).text,
    network.external ? "external" : "VPC",
    network.zone ?? "",
  ],
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
  describe: (lb) => [statusCell(lb.status).text, lb.address],
  list: listLoadBalancers,
  lsCommand: "nipa lb ls",
  noun: "load balancer",
  plural: "load balancers",
};

export const DATABASES: Findable<Database> = {
  describe: ({ primary }) =>
    primary ? [statusCell(primary.status).text, databaseAddress(primary)] : [],
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
        `    and ${more} more. Run \`${kind.lsCommand} --json\` to get their IDs.`,
      ]
    : lines;
};

/** The items whose ID is `ref`, or else the items named `ref`. */
export const matching = <T extends Named>(
  items: readonly T[],
  ref: string
): T[] => {
  const byId = items.filter((item) => item.id === ref);
  return byId.length > 0 ? byId : items.filter((item) => item.name === ref);
};

/** What an error needs to name a kind and the commands that find it. */
export type FindableName = Pick<
  Findable<Named>,
  "lsCommand" | "noun" | "plural" | "searchCommand"
>;

// A word that can sit inside backticks in a hint, and after a command name,
// and be copied back as it is.
const copyable = (word: string): boolean =>
  word !== "" && !word.startsWith("-") && !/[\n\r`]/u.test(word);

/**
 * The error for a `ref` that names no item of `kind`. `names` are the names
 * of the items in the project: a close one is suggested, in the hint and in
 * `data.suggestion`, never in `next`, because a script must not run a guess.
 * A kind with a `searchCommand` sends the person there first, since the
 * likeliest miss is a resource in another project. Under `-p` the search
 * would read only that project, so it isn't suggested.
 */
export const notFoundError = (
  kind: FindableName,
  projectName: string,
  ref: string,
  names: readonly string[] = []
): CliError => {
  const guess = closest(ref, names);
  const suggestion = guess !== undefined && copyable(guess) ? guess : undefined;
  const search =
    kind.searchCommand !== undefined &&
    copyable(ref) &&
    runScope()?.project === undefined
      ? kind.searchCommand
      : undefined;
  const where =
    search === undefined
      ? `Run \`${kind.lsCommand}\` to see your ${kind.plural}.`
      : `Run \`${search} ${shellQuote(ref)}\` to look in every project, or \`${kind.lsCommand}\` to see the ${kind.plural} in this one.`;
  return new CliError(
    `no ${kind.noun} named or with ID "${ref}" in ${projectName}`,
    {
      data: suggestion === undefined ? undefined : { suggestion },
      hint:
        suggestion === undefined
          ? where
          : `Did you mean \`${suggestion}\`? ${where}`,
      next:
        search === undefined
          ? [kind.lsCommand]
          : [[...search.split(" "), ref], kind.lsCommand],
      reason: "not_found",
    }
  );
};

/** The error for a `ref` that names more than one item of `kind`. */
export const ambiguousError = <T extends Named>(
  kind: Findable<T>,
  projectName: string,
  ref: string,
  candidates: readonly T[]
): CliError =>
  new CliError(
    `${candidates.length} ${kind.plural} in ${projectName} are named "${ref}"`,
    {
      data: { ids: candidates.map((item) => item.id) },
      hint: ["Name one by its ID:", ...candidateLines(kind, candidates)].join(
        "\n"
      ),
      reason: "ambiguous_name",
    }
  );

/** What `describe` shows for `item`, such as its status and address. */
export const describeItem = <T extends Named>(
  kind: Findable<T>,
  item: T
): readonly string[] => kind.describe?.(item) ?? [];

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
  const [match, ...others] = matching(items, ref);
  if (!match) {
    throw notFoundError(
      kind,
      projectName,
      ref,
      items.map((item) => item.name)
    );
  }
  if (others.length > 0) {
    throw ambiguousError(kind, projectName, ref, [match, ...others]);
  }
  return match;
};

export const findServer = (input: {
  space: Space;
  projectName: string;
  ref: string;
}): Promise<Server> => findResource({ ...input, kind: SERVERS });

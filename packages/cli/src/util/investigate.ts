// `nipa investigate`: find what a name or ID refers to, among the kinds the
// CLI lists, read everything nipa can about it in parallel, and judge it
// with the checks in investigate-checks.ts. Another command, such as an MCP
// server, can call `investigate` without going through the CLI.

import type { Space } from "./api";
import {
  getConsoleLog,
  getServerState,
  listServerActions,
  listServers,
} from "./compute";
import type { Server } from "./compute";
import { inspectDatabaseParts } from "./database";
import type { Database } from "./database";
import {
  ambiguousError,
  DATABASES,
  describeItem,
  LOAD_BALANCERS,
  matching,
  notFoundError,
  SERVERS,
  VOLUMES,
} from "./find";
import type { Findable, FindableName } from "./find";
import {
  finding,
  INVESTIGATED_KINDS,
  judge,
  scopeFindings,
  settle,
  sortFindings,
} from "./findings";
import type {
  Finding,
  InvestigatedKind,
  Investigation,
  Read,
} from "./findings";
import { CANNOT_SEE, CHECKS } from "./investigate-checks";
import { groupClusters } from "./kubernetes";
import type { KubernetesCluster } from "./kubernetes";
import { inspectLoadBalancer } from "./load-balancer";
import type { LoadBalancer } from "./load-balancer";
import { listQuotas } from "./quota";
import type { Quota } from "./quota";
import { runScope, shellQuote } from "./scope";
import type { RunScope } from "./scope";
import { andList, CliError, oneLine } from "./ui";
import type { Volume } from "./volume";

/** What `investigate` is asked about. */
export interface Target {
  /** A name or ID, as the person typed it. */
  ref: string;
  /** Look only among this kind. Without it, nipa looks among every kind. */
  kind?: InvestigatedKind;
  /** The project's name, for errors. */
  projectName: string;
}

/** What judging one resource needs besides the resource. */
interface JudgeInput {
  ref: string;
  now: number;
  quotas: Promise<Read<Quota[]>>;
}

/** One resource the name or ID matched, ready to be judged. */
interface Candidate {
  kind: InvestigatedKind;
  id: string;
  name: string;
  /** What tells it apart from the others, such as its status and address. */
  columns: readonly string[];
  judge: (input: JudgeInput) => Promise<Finding[]>;
}

/** What one kind's list says about the name or ID. */
interface Look {
  kind: InvestigatedKind;
  candidates: Candidate[];
  /** The error for a name that more than one item of this kind has. */
  ambiguous: CliError | undefined;
}

/** A Kubernetes cluster has no name, so its ID stands in for one. */
type NamedCluster = KubernetesCluster & { name: string };

const namedClusters = (servers: readonly Server[]): NamedCluster[] =>
  groupClusters(servers).map((cluster) => ({ ...cluster, name: cluster.id }));

const KUBERNETES_CLUSTERS: Findable<NamedCluster> = {
  describe: (cluster) => {
    const active = cluster.nodes.filter((n) => n.status === "ACTIVE");
    return [`${active.length} of ${cluster.nodes.length} nodes Active`];
  },
  list: async (space) => namedClusters(await listServers(space)),
  lsCommand: "nipa k8s ls",
  noun: "Kubernetes cluster",
  plural: "Kubernetes clusters",
};

/** How errors name each kind, and the command that lists it. */
const FINDABLE = {
  db: DATABASES,
  k8s: KUBERNETES_CLUSTERS,
  lb: LOAD_BALANCERS,
  server: SERVERS,
  volume: VOLUMES,
} as const satisfies Record<InvestigatedKind, FindableName>;

const look = async <T extends { id: string; name: string }>(input: {
  kind: InvestigatedKind;
  findable: Findable<T>;
  items: Promise<T[]>;
  target: Target;
  judge: (item: T, judgeInput: JudgeInput) => Promise<Finding[]>;
}): Promise<Look> => {
  const { findable, kind, target } = input;
  const matches = matching(await input.items, target.ref);
  return {
    ambiguous:
      matches.length > 1
        ? ambiguousError(findable, target.projectName, target.ref, matches)
        : undefined,
    candidates: matches.map((item) => ({
      columns: describeItem(findable, item),
      id: item.id,
      judge: (judgeInput) => input.judge(item, judgeInput),
      kind,
      name: item.name || item.id,
    })),
    kind,
  };
};

const judgeServer = async (
  space: Space,
  server: Server,
  input: JudgeInput
): Promise<Finding[]> => {
  const { id } = server;
  const [state, actions, consoleLog, volumes] = await Promise.all([
    settle(getServerState(space, id)),
    settle(listServerActions(space, id)),
    settle(getConsoleLog(space, id)),
    settle(VOLUMES.list(space)),
  ]);
  return judge(CHECKS.server, {
    actions,
    consoleLog,
    now: input.now,
    quotas: await input.quotas,
    ref: input.ref,
    server,
    state,
    volumes,
  });
};

const judgeLoadBalancer = async (
  space: Space,
  lb: LoadBalancer,
  input: JudgeInput
): Promise<Finding[]> =>
  judge(CHECKS.lb, {
    detail: await settle(inspectLoadBalancer(space, lb.id)),
    lb,
    now: input.now,
    quotas: await input.quotas,
    ref: input.ref,
  });

const judgeDatabase = async (
  space: Space,
  database: Database,
  input: JudgeInput
): Promise<Finding[]> => {
  const { detail, failures } = await inspectDatabaseParts(space, database);
  return judge(CHECKS.db, {
    database: detail,
    failures,
    now: input.now,
    quotas: await input.quotas,
    ref: input.ref,
  });
};

const judgeVolume = async (
  servers: Promise<Read<Server[]>>,
  volume: Volume,
  input: JudgeInput
): Promise<Finding[]> =>
  judge(CHECKS.volume, {
    now: input.now,
    quotas: await input.quotas,
    ref: input.ref,
    servers: await servers,
    volume,
  });

const judgeCluster = async (
  space: Space,
  cluster: NamedCluster,
  input: JudgeInput
): Promise<Finding[]> => {
  const down = cluster.nodes.filter((node) => node.status !== "ACTIVE");
  const actions = await Promise.all(
    down.map(
      async (node) =>
        [node.id, await settle(listServerActions(space, node.id))] as const
    )
  );
  return judge(CHECKS.k8s, {
    actions: new Map(actions),
    cluster,
    now: input.now,
    quotas: await input.quotas,
    ref: input.ref,
  });
};

/**
 * Lists the kinds `target` asks about. Servers, the Kubernetes clusters made
 * of them, and a volume's attachments share one request.
 */
const lookEverywhere = (
  space: Space,
  target: Target
): Promise<{ kind: InvestigatedKind; read: Read<Look> }>[] => {
  let servers: Promise<Server[]> | undefined;
  const listServersOnce = (): Promise<Server[]> => {
    servers ??= listServers(space);
    return servers;
  };
  const listClustersOnce = async (): Promise<NamedCluster[]> =>
    namedClusters(await listServersOnce());
  const lookers = {
    db: () =>
      look({
        findable: DATABASES,
        items: DATABASES.list(space),
        judge: (item, input) => judgeDatabase(space, item, input),
        kind: "db",
        target,
      }),
    k8s: () =>
      look({
        findable: KUBERNETES_CLUSTERS,
        items: listClustersOnce(),
        judge: (item, input) => judgeCluster(space, item, input),
        kind: "k8s",
        target,
      }),
    lb: () =>
      look({
        findable: LOAD_BALANCERS,
        items: LOAD_BALANCERS.list(space),
        judge: (item, input) => judgeLoadBalancer(space, item, input),
        kind: "lb",
        target,
      }),
    server: () =>
      look({
        findable: SERVERS,
        items: listServersOnce(),
        judge: (item, input) => judgeServer(space, item, input),
        kind: "server",
        target,
      }),
    volume: () =>
      look({
        findable: VOLUMES,
        items: VOLUMES.list(space),
        judge: (item, input) =>
          judgeVolume(settle(listServersOnce()), item, input),
        kind: "volume",
        target,
      }),
  } satisfies Record<InvestigatedKind, () => Promise<Look>>;
  const kinds = target.kind ? [target.kind] : INVESTIGATED_KINDS;
  return kinds.map(async (kind) => ({
    kind,
    read: await settle(lookers[kind]()),
  }));
};

/** "a or b", "a, b or c". */
const orList = (words: readonly string[]): string => {
  const last = words.at(-1) ?? "";
  const rest = words.slice(0, -1);
  return rest.length === 0 ? last : `${rest.join(", ")} or ${last}`;
};

const inBackticks = (command: string): string => `\`${command}\``;

const ALL_LS = INVESTIGATED_KINDS.map((kind) => FINDABLE[kind].lsCommand);

/** The kinds nipa couldn't list, by their plural, with why. */
interface Unread {
  kind: InvestigatedKind;
  reason: string;
  error?: Error;
}

const unreadText = (unread: readonly Unread[]): string =>
  andList(
    unread.map(({ kind, reason }) => `the ${FINDABLE[kind].plural} (${reason})`)
  );

const notFoundAnywhere = (
  target: Target,
  unread: readonly Unread[]
): CliError => {
  const nouns = orList(INVESTIGATED_KINDS.map((kind) => FINDABLE[kind].noun));
  const missed =
    unread.length > 0
      ? `nipa couldn't read ${unreadText(unread)}, so it may be there. `
      : "";
  return new CliError(
    `no ${nouns} named or with ID "${target.ref}" in ${target.projectName}`,
    {
      hint: `${missed}Run ${orList(ALL_LS.map(inBackticks))} to see them.`,
      next: ALL_LS,
      reason: "not_found",
    }
  );
};

const alignRows = (rows: readonly (readonly string[])[]): string[] => {
  const columns = Math.max(...rows.map((row) => row.length));
  const widths = Array.from({ length: columns }, (_, column) =>
    Math.max(...rows.map((row) => row[column]?.length ?? 0))
  );
  return rows.map(
    (row) =>
      `    ${row
        .map((cell, column) => cell.padEnd(widths[column] ?? 0))
        .join("  ")
        .trimEnd()}`
  );
};

/** The error for a name that items of more than one kind have. */
const ambiguousAcrossKinds = (
  target: Target,
  looks: readonly Look[]
): CliError => {
  const names = andList(
    looks.map(({ candidates, kind }) =>
      candidates.length === 1
        ? `a ${FINDABLE[kind].noun}`
        : `${candidates.length} ${FINDABLE[kind].plural}`
    )
  );
  // Each row's command picks that item alone: by kind when the name is one
  // of a kind, else by ID.
  const rows = looks.flatMap(({ candidates, kind }) =>
    candidates.map((candidate) => {
      const words =
        candidates.length === 1
          ? ["nipa", "investigate", target.ref, "--kind", kind]
          : ["nipa", "investigate", candidate.id];
      const command = words.map((word) => shellQuote(word)).join(" ");
      return [`\`${command}\``, FINDABLE[kind].noun, ...candidate.columns].map(
        oneLine
      );
    })
  );
  return new CliError(
    `"${target.ref}" in ${target.projectName} names ${names}`,
    {
      data: {
        ids: looks.flatMap(({ candidates }) => candidates.map((c) => c.id)),
      },
      hint: ["Pick one with `--kind` or its ID:", ...alignRows(rows)].join(
        "\n"
      ),
      reason: "ambiguous_name",
    }
  );
};

/**
 * The one resource `target` names, and a warning when a kind nipa couldn't
 * list might hold it too. Throws when it names nothing or more than one.
 */
const resolve = async (
  space: Space,
  target: Target
): Promise<{ candidate: Candidate; warnings: Finding[] }> => {
  const reads = await Promise.all(lookEverywhere(space, target));
  const looks: Look[] = [];
  const unread: Unread[] = [];
  for (const { kind, read } of reads) {
    if (read.ok) {
      looks.push(read.value);
    } else {
      unread.push({ error: read.error, kind, reason: read.reason });
    }
  }
  // Nothing listed, so the failure is the answer, such as an expired session.
  const [firstUnread] = unread;
  if (looks.length === 0 && firstUnread?.error) {
    throw firstUnread.error;
  }
  const found = looks.filter((l) => l.candidates.length > 0);
  if (found.length > 1) {
    throw ambiguousAcrossKinds(target, found);
  }
  const [only] = found;
  if (only?.ambiguous) {
    throw only.ambiguous;
  }
  const [candidate] = only?.candidates ?? [];
  if (!candidate) {
    throw target.kind
      ? notFoundError(FINDABLE[target.kind], target.projectName, target.ref)
      : notFoundAnywhere(target, unread);
  }
  const warnings =
    unread.length === 0
      ? []
      : [
          finding(
            "warning",
            "resolve",
            `nipa couldn't read ${unreadText(unread)}, so "${target.ref}" may name one of those too`,
            {
              evidence: unread.map(
                ({ kind, reason }) => `${FINDABLE[kind].plural}: ${reason}`
              ),
            }
          ),
        ];
  return { candidate, warnings };
};

/**
 * What nipa can see that is wrong with the resource `target` names. Reads
 * fail softly: one that fails is a warning, never a crash. Each `next`
 * command runs in `scope`, which defaults to this run's `-P` and `-p`.
 */
export const investigate = async (
  space: Space,
  target: Target,
  options: { now?: number; scope?: RunScope } = {}
): Promise<Investigation> => {
  const { candidate, warnings } = await resolve(space, target);
  const findings = await candidate.judge({
    now: options.now ?? Date.now(),
    quotas: settle(listQuotas(space)),
    ref: target.ref,
  });
  return {
    cannotSee: [...CANNOT_SEE[candidate.kind]],
    findings: scopeFindings(
      sortFindings([...findings, ...warnings]),
      options.scope ?? runScope()
    ),
    id: candidate.id,
    kind: candidate.kind,
    name: candidate.name,
  };
};

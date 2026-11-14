// The checks `nipa investigate` runs, by kind. Each one reads data a loader
// already fetched, and says only what that data shows: a field and its
// value, never a cause it can't see.

import { actionFailed } from "./compute";
import type { ConsoleLog, Server, ServerAction, ServerState } from "./compute";
import type { DatabaseDetail, DatabasePartFailure } from "./database";
import { databaseProblems, describeProblem } from "./database-health";
import type { DatabaseProblem } from "./database-health";
import { finding, nextCommand, quotaFindings, readFailures } from "./findings";
import type {
  Check,
  Finding,
  InvestigatedKind,
  QuotaRef,
  Read,
} from "./findings";
import type { KubernetesCluster } from "./kubernetes";
import { diagnose, isServing, isStandby } from "./load-balancer";
import type { LoadBalancer, LoadBalancerDetail, Part } from "./load-balancer";
import type { Quota } from "./quota";
import { isChanging, isFailing, statusLabel } from "./status";
import { capitalize, formatAge, plural } from "./ui";
import type { Volume } from "./volume";

/** What every check knows besides its data. */
interface Context {
  /** The name or ID the person typed, so a next command names the same item. */
  ref: string;
  now: number;
}

export interface ServerData extends Context {
  server: Server;
  state: Read<ServerState>;
  actions: Read<ServerAction[]>;
  consoleLog: Read<ConsoleLog>;
  /** Every volume in the project, to find the server's own. */
  volumes: Read<Volume[]>;
  quotas: Read<Quota[]>;
}

export interface LoadBalancerData extends Context {
  lb: LoadBalancer;
  detail: Read<LoadBalancerDetail>;
  quotas: Read<Quota[]>;
}

export interface DatabaseData extends Context {
  database: DatabaseDetail;
  failures: DatabasePartFailure[];
  quotas: Read<Quota[]>;
}

export interface VolumeData extends Context {
  volume: Volume;
  /** Every server in the project, to find the ones the volume is attached to. */
  servers: Read<Server[]>;
  quotas: Read<Quota[]>;
}

export interface ClusterData extends Context {
  cluster: KubernetesCluster;
  /** The actions of each node that isn't active, by the node's ID. */
  actions: ReadonlyMap<string, Read<ServerAction[]>>;
  quotas: Read<Quota[]>;
}

/** The data each kind's checks read. */
export interface KindData {
  server: ServerData;
  lb: LoadBalancerData;
  db: DatabaseData;
  volume: VolumeData;
  k8s: ClusterData;
}

const CONSOLE_LOG = "console-log";
const QUOTAS = "the quotas";

const COMPUTE_QUOTAS: QuotaRef[] = [
  { group: "compute", label: "servers", name: "instances" },
  { group: "compute", label: "vCPUs", name: "cores" },
  { group: "compute", label: "MB of RAM", name: "ram" },
];

const isActive = (status: string): boolean => status.toUpperCase() === "ACTIVE";

/** "create failed 26m ago by Ann", or without "failed" for one that didn't. */
const describeAction = (action: ServerAction, now: number): string => {
  const verb = actionFailed(action) ? `${action.action} failed` : action.action;
  const by = action.user === null ? "" : ` by ${action.user}`;
  return `${verb} ${formatAge(now - Date.parse(action.startedAt))} ago${by}`;
};

const actionEvidence = (action: ServerAction): string[] => [
  `action: ${action.action}`,
  `remark: ${action.remark ?? "none"}`,
  `request: ${action.requestId}`,
  `started: ${action.startedAt}`,
  ...(action.user === null ? [] : [`user: ${action.user}`]),
];

// Creating, resizing and rebuilding draw on the compute quotas.
const QUOTA_ACTIONS = new Set(["create", "resize", "rebuild"]);

const failedQuotaAction = (actions: Read<ServerAction[]>): boolean => {
  const [latest] = actions.ok ? actions.value : [];
  return (
    latest !== undefined &&
    actionFailed(latest) &&
    QUOTA_ACTIONS.has(latest.action)
  );
};

// Server

/** The action that puts a server in each of these states, by Nova's name for it. */
const STOPPED_BY = new Map([
  ["PAUSED", ["pause"]],
  ["SHELVED", ["shelve"]],
  ["SHELVED_OFFLOADED", ["shelve", "shelveOffload"]],
  ["SHUTOFF", ["stop"]],
  ["SUSPENDED", ["suspend"]],
]);

export const serverStatus: Check<ServerData> = ({
  actions,
  now,
  ref,
  server,
}) => {
  const { name, status } = server;
  const evidence = [`status: ${status}`];
  const upper = status.toUpperCase();
  if (upper === "ERROR") {
    return [
      finding("problem", "status", `${name} is in Error`, {
        evidence,
        next: [
          nextCommand("nipa", "server", "history", ref),
          nextCommand("nipa", "server", "logs", ref),
        ],
      }),
    ];
  }
  const stopped = STOPPED_BY.get(upper);
  if (stopped) {
    const [latest] = actions.ok ? actions.value : [];
    const state = upper === "SHUTOFF" ? "shut off" : statusLabel(status);
    const next =
      upper === "SHUTOFF" ? [nextCommand("nipa", "server", "start", ref)] : [];
    // The latest action only shows who asked, so say that and nothing more.
    if (
      latest !== undefined &&
      !actionFailed(latest) &&
      stopped.includes(latest.action)
    ) {
      return [
        finding(
          "warning",
          "status",
          `${name} is ${state}, and the latest action, ${describeAction(latest, now)}, worked`,
          { evidence: [...evidence, ...actionEvidence(latest)], next }
        ),
      ];
    }
    return [
      finding(
        "problem",
        "status",
        upper === "SHUTOFF"
          ? `${name} is shut off`
          : `${name} is ${state}, not Active`,
        { evidence, next }
      ),
    ];
  }
  if (isChanging(status)) {
    return [
      finding(
        "warning",
        "status",
        `${name} is in ${statusLabel(status)} and not running yet`,
        { evidence }
      ),
    ];
  }
  if (isActive(status)) {
    return [finding("ok", "status", `${name} is Active`, { evidence })];
  }
  return [
    finding(
      "problem",
      "status",
      `${name} is ${statusLabel(status)}, not Active`,
      { evidence }
    ),
  ];
};

/** How long Nova's task may run after the last action before it looks stuck. */
export const STUCK_TASK_MS = 60 * 60 * 1000;

export const serverTask: Check<ServerData> = ({
  actions,
  now,
  ref,
  server,
  state,
}) => {
  if (!state.ok || state.value.taskState === null) {
    return [];
  }
  const { taskState } = state.value;
  const [latest] = actions.ok ? actions.value : [];
  const next = [nextCommand("nipa", "server", "history", ref)];
  if (latest && now - Date.parse(latest.startedAt) > STUCK_TASK_MS) {
    const since = formatAge(now - Date.parse(latest.startedAt));
    return [
      finding(
        "problem",
        "task",
        `${server.name}'s task, ${taskState}, hasn't finished in the ${since} since its last action, ${latest.action}`,
        {
          evidence: [
            `task_state: ${taskState}`,
            `last action: ${latest.action} at ${latest.startedAt}`,
          ],
          next,
        }
      ),
    ];
  }
  return [
    finding("warning", "task", `${server.name} is busy: ${taskState}`, {
      evidence: [`task_state: ${taskState}`],
      next,
    }),
  ];
};

export const serverLock: Check<ServerData> = ({ server, state }) => {
  if (!state.ok || state.value.locked !== true) {
    return [];
  }
  return [
    finding(
      "warning",
      "lock",
      `${server.name} is locked, so a start, stop or other change fails until someone unlocks it`,
      { evidence: ["locked: true"] }
    ),
  ];
};

export const serverActions: Check<ServerData> = ({ actions, now, ref }) => {
  const [latest] = actions.ok ? actions.value : [];
  if (!latest) {
    return [];
  }
  if (!actionFailed(latest)) {
    return [
      finding("ok", "actions", `The last action, ${latest.action}, worked`, {
        evidence: [
          `action: ${latest.action}`,
          `remark: ${latest.remark ?? "none"}`,
        ],
      }),
    ];
  }
  return [
    finding("problem", "actions", capitalize(describeAction(latest, now)), {
      evidence: actionEvidence(latest),
      next: [nextCommand("nipa", "server", "history", ref)],
    }),
  ];
};

/** Console lines that say why a server stopped working, by what they show. */
export const CONSOLE_PATTERNS = [
  { label: "a kernel panic", pattern: /kernel panic|not syncing/iu },
  {
    label: "the kernel killing processes for lack of memory",
    pattern: /out of memory|oom-killer|oom_reaper/iu,
  },
  {
    label: "a cloud-init failure",
    // Matched by message, not level: cloud-init logs a failed module or
    // user-data script at WARNING, the level of its harmless boot warnings.
    pattern:
      /cloud-init.*(?:\btraceback\b|\[(?:CRITICAL|ERROR)\])|running module \S+ .*failed|failed (?:running|to run) module|failed running \/var\/lib\/cloud\/|failed to start.*(?:cloud-init|cloud-config|cloud-final|cloud user\/final)|cloud-(?:init|config|final)\.service.*failure/iu,
  },
  { label: "a full disk", pattern: /no space left on device/iu },
] as const;

const MAX_LINES = 3;

export const serverConsole: Check<ServerData> = ({
  consoleLog,
  ref,
  server,
}) => {
  if (!consoleLog.ok) {
    return [];
  }
  if (consoleLog.value.kind === "none") {
    return [
      finding(
        "warning",
        CONSOLE_LOG,
        `${server.name} has no console log. The Space API keeps one only for a server that booted`,
        {
          evidence: ["console log: none"],
          next: [nextCommand("nipa", "server", "history", ref)],
        }
      ),
    ];
  }
  const lines = consoleLog.value.text
    .split("\n")
    .filter((line) => line.trim() !== "");
  const found = CONSOLE_PATTERNS.flatMap(({ label, pattern }) => {
    const matches = lines.filter((line) => pattern.test(line));
    if (matches.length === 0) {
      return [];
    }
    return [
      finding("problem", CONSOLE_LOG, `The console log shows ${label}`, {
        evidence: matches.slice(-MAX_LINES).map((line) => line.trim()),
        next: [nextCommand("nipa", "server", "logs", ref)],
      }),
    ];
  });
  if (found.length > 0) {
    return found;
  }
  return [
    finding(
      "ok",
      CONSOLE_LOG,
      "The console log shows no kernel panic, out-of-memory, cloud-init or full-disk lines",
      { evidence: [`console log: ${plural(lines.length, "line")} read`] }
    ),
  ];
};

export const serverVolumes: Check<ServerData> = ({ server, volumes }) => {
  if (!volumes.ok || server.volumes.length === 0) {
    return [];
  }
  const found = server.volumes.flatMap((attached): Finding[] => {
    const volume = volumes.value.find((v) => v.id === attached.id);
    const name = attached.name || attached.id;
    const next = [nextCommand("nipa", "investigate", attached.id)];
    if (!volume) {
      return [
        finding(
          "warning",
          "volumes",
          `Volume ${name} isn't in the project's volume list`,
          { evidence: [`volume ${attached.id}: not listed`], next }
        ),
      ];
    }
    if (volume.status === "in-use") {
      return [];
    }
    const severity = isFailing(volume.status) ? "problem" : "warning";
    return [
      finding(
        severity,
        "volumes",
        `Volume ${name} is ${statusLabel(volume.status)}, not In use`,
        { evidence: [`volume ${name} status: ${volume.status}`], next }
      ),
    ];
  });
  if (found.length > 0) {
    return found;
  }
  const count = plural(server.volumes.length, "volume");
  return [
    finding(
      "ok",
      "volumes",
      `Its ${count} ${server.volumes.length === 1 ? "is" : "are"} In use`,
      {
        evidence: server.volumes.map(
          (v) => `volume ${v.name || v.id} status: in-use`
        ),
      }
    ),
  ];
};

export const serverAddress: Check<ServerData> = ({ server }) => {
  if (server.addresses.length === 0) {
    return [
      finding("problem", "address", `${server.name} has no IP address`, {
        evidence: ["internal_ips: none", "external_ips: none"],
      }),
    ];
  }
  return [
    finding("ok", "address", `${server.name} has an IP address`, {
      evidence: server.addresses.map(
        (a) =>
          `${a.type === "floating" ? "external" : "internal"}: ${a.address}`
      ),
    }),
  ];
};

export const serverQuotas: Check<ServerData> = ({
  actions,
  quotas,
  server,
}) => {
  const failedCreate = failedQuotaAction(actions);
  const status = server.status.toUpperCase();
  if (
    !(quotas.ok && (failedCreate || status === "ERROR" || isChanging(status)))
  ) {
    return [];
  }
  return quotaFindings({
    failedCreate,
    quotas: quotas.value,
    refs: COMPUTE_QUOTAS,
  });
};

export const serverReads: Check<ServerData> = (data) =>
  readFailures([
    ["the server's state", data.state],
    ["the server's actions", data.actions],
    ["the console log", data.consoleLog],
    ["the volumes", data.volumes],
    [QUOTAS, data.quotas],
  ]);

// Load balancer

const partEvidence = (noun: string, name: string | null, part: Part): string =>
  `${noun} ${name ?? part.id}: provisioning_status ${part.status}, operating_status ${part.health}`;

/** The parts that don't serve, as evidence, leaving out backups on standby. */
const brokenParts = (lb: LoadBalancerDetail): string[] => {
  const evidence: string[] = [];
  if (!isServing(lb)) {
    evidence.push(partEvidence("load balancer", lb.name, lb));
  }
  for (const listener of lb.listenerDetails) {
    if (!isServing(listener)) {
      evidence.push(partEvidence("listener", listener.name, listener));
    }
  }
  for (const group of lb.backendGroups) {
    if (!isServing(group)) {
      evidence.push(partEvidence("backend group", group.name, group));
    }
    if (group.healthCheck && !isServing(group.healthCheck)) {
      evidence.push(
        partEvidence("health check of", group.name, group.healthCheck)
      );
    }
    for (const member of group.members) {
      if (!(isServing(member) || isStandby(member))) {
        evidence.push(partEvidence("member", member.name, member));
      }
    }
  }
  return evidence;
};

const LB_CHANGES = new Map([
  ["PENDING_CREATE", "still being set up"],
  ["PENDING_DELETE", "being deleted"],
  ["PENDING_UPDATE", "being updated"],
]);

export const lbStatus: Check<LoadBalancerData> = ({ lb, ref }) => {
  const evidence = [
    `provisioning_status: ${lb.status}`,
    `operating_status: ${lb.health}`,
  ];
  if (isFailing(lb.status)) {
    return [
      finding(
        "problem",
        "status",
        `${lb.name} is in ${statusLabel(lb.status)}`,
        {
          evidence,
          next: [nextCommand("nipa", "lb", "inspect", ref)],
        }
      ),
    ];
  }
  if (isChanging(lb.status)) {
    return [
      finding(
        "warning",
        "status",
        `${lb.name} is ${LB_CHANGES.get(lb.status.toUpperCase()) ?? "changing"}: ${statusLabel(lb.status)}`,
        { evidence }
      ),
    ];
  }
  return [
    finding("ok", "status", `${lb.name} is ${statusLabel(lb.status)}`, {
      evidence,
    }),
  ];
};

export const lbServing: Check<LoadBalancerData> = ({ detail, lb, ref }) => {
  if (!detail.ok) {
    return [];
  }
  const { details, healthy, verdict } = diagnose(detail.value);
  if (healthy) {
    return [
      finding("ok", "serving", verdict, {
        evidence:
          details.length > 0 ? details : ["every part: ACTIVE and ONLINE"],
      }),
    ];
  }
  const evidence = brokenParts(detail.value);
  if (detail.value.listenerDetails.length === 0) {
    evidence.unshift("listeners: none");
  }
  // While Octavia changes it, a part that doesn't serve yet isn't broken.
  return [
    finding(isChanging(lb.status) ? "warning" : "problem", "serving", verdict, {
      evidence,
      next: [nextCommand("nipa", "lb", "inspect", ref)],
    }),
  ];
};

export const lbQuotas: Check<LoadBalancerData> = ({ lb, quotas }) => {
  const building = lb.status.toUpperCase() === "PENDING_CREATE";
  if (!(quotas.ok && (building || isFailing(lb.status)))) {
    return [];
  }
  return quotaFindings({
    failedCreate: false,
    quotas: quotas.value,
    refs: [
      { group: "loadBalancer", label: "load balancers", name: "load_balancer" },
      { group: "loadBalancer", label: "listeners", name: "listener" },
      { group: "loadBalancer", label: "pools", name: "pool" },
    ],
  });
};

export const lbReads: Check<LoadBalancerData> = (data) =>
  readFailures([
    ["the listeners, backend groups and members", data.detail],
    [QUOTAS, data.quotas],
  ]);

// Database

// A fragment that starts with a replica's name keeps the name as it is.
const sentence = (fragment: string): string =>
  fragment.startsWith("the ") ? capitalize(fragment) : fragment;

const problemEvidence = (problem: DatabaseProblem): string => {
  if (problem.part === "cluster") {
    return "primary: none";
  }
  const owner =
    problem.part === "primary" ? "primary" : `${problem.part} ${problem.name}`;
  return `${owner} ${problem.field}: ${problem.value}`;
};

const statusOfPart = (
  database: DatabaseDetail,
  problem: DatabaseProblem
): string | undefined => {
  if (problem.part === "primary") {
    return database.primary?.status;
  }
  if (problem.part === "replica") {
    return database.replicas?.find((r) => r.name === problem.name)?.status;
  }
  return undefined;
};

export const dbHealth: Check<DatabaseData> = ({ database, ref }) => {
  const problems = databaseProblems(database);
  const next = [nextCommand("nipa", "db", "inspect", ref)];
  if (problems.length === 0) {
    const { primary } = database;
    return primary
      ? [
          finding("ok", "health", "The primary is Active and Healthy", {
            evidence: [
              `primary status: ${primary.status}`,
              `primary health: ${primary.health}`,
            ],
          }),
        ]
      : [];
  }
  // A part on its way to running, such as one Trove still builds, isn't
  // broken yet, and its health is unknown until it runs.
  return problems.map((problem) => {
    const status = statusOfPart(database, problem);
    const building = status !== undefined && isChanging(status);
    return finding(
      building ? "warning" : "problem",
      "health",
      sentence(describeProblem(problem)),
      { evidence: [problemEvidence(problem)], next }
    );
  });
};

export const dbLogs: Check<DatabaseData> = ({ database, ref }) =>
  (database.logs ?? [])
    .filter((log) => isFailing(log.status))
    .map((log) =>
      finding(
        "problem",
        "logs",
        `The ${statusLabel(log.name).toLowerCase()} log is ${statusLabel(log.status)}`,
        {
          evidence: [`log ${log.name} status: ${log.status}`],
          next: [nextCommand("nipa", "db", "inspect", ref)],
        }
      )
    );

export const dbQuotas: Check<DatabaseData> = ({ database, quotas }) => {
  const { primary } = database;
  const failed = primary !== null && isFailing(primary.status);
  const building = primary === null || isChanging(primary.status);
  if (!(quotas.ok && (failed || building))) {
    return [];
  }
  return quotaFindings({
    failedCreate: false,
    quotas: quotas.value,
    refs: [
      { group: "sqlDatabase", label: "databases", name: "database_instances" },
      { group: "sqlDatabase", label: "MB of database RAM", name: "ram" },
      {
        group: "sqlDatabase",
        label: "GB of database storage",
        name: "volume_size",
      },
    ],
  });
};

export const dbReads: Check<DatabaseData> = (data) => [
  ...data.failures.map((failure) =>
    finding("warning", "read", `nipa couldn't read the ${failure.part}`, {
      evidence: [`error: ${failure.reason}`],
    })
  ),
  ...readFailures([[QUOTAS, data.quotas]]),
];

// Volume

const volumeName = (volume: Volume): string => volume.name || volume.id;

export const volumeStatus: Check<VolumeData> = ({ volume }) => {
  const name = volumeName(volume);
  const evidence = [`status: ${volume.status}`];
  if (isFailing(volume.status)) {
    return [
      finding(
        "problem",
        "status",
        `${name} is in ${statusLabel(volume.status)}`,
        {
          evidence,
        }
      ),
    ];
  }
  if (isChanging(volume.status)) {
    return [
      finding("warning", "status", `${name} is ${statusLabel(volume.status)}`, {
        evidence,
      }),
    ];
  }
  return [
    finding("ok", "status", `${name} is ${statusLabel(volume.status)}`, {
      evidence,
    }),
  ];
};

export const volumeAttachments: Check<VolumeData> = ({ servers, volume }) => {
  const name = volumeName(volume);
  if (volume.status === "in-use" && volume.attachments.length === 0) {
    return [
      finding(
        "problem",
        "attachments",
        `${name} is In use but attached to no server`,
        { evidence: ["status: in-use", "attachments: none"] }
      ),
    ];
  }
  if (!servers.ok) {
    return [];
  }
  return volume.attachments.map((attachment) => {
    const server = servers.value.find((s) => s.id === attachment.serverId);
    const evidence = [
      `attachment: server ${attachment.serverId} at ${attachment.device}`,
    ];
    if (!server) {
      return finding(
        "problem",
        "attachments",
        `${name} is attached to server ${attachment.serverId}, which isn't in the project's server list`,
        { evidence: [...evidence, "servers: none with that ID"] }
      );
    }
    return finding(
      "ok",
      "attachments",
      `Attached to ${server.name} at ${attachment.device}`,
      {
        evidence: [
          ...evidence,
          `server ${server.name} status: ${server.status}`,
        ],
        next: [nextCommand("nipa", "investigate", server.id)],
      }
    );
  });
};

export const volumeQuotas: Check<VolumeData> = ({ quotas, volume }) => {
  const failed = isFailing(volume.status);
  if (!(quotas.ok && (failed || isChanging(volume.status)))) {
    return [];
  }
  return quotaFindings({
    failedCreate: false,
    quotas: quotas.value,
    refs: [
      { group: "storage", label: "volumes", name: "volumes" },
      { group: "storage", label: "GB of volumes", name: "volume_size" },
    ],
  });
};

export const volumeReads: Check<VolumeData> = (data) =>
  readFailures([
    ["the servers", data.servers],
    [QUOTAS, data.quotas],
  ]);

// Kubernetes cluster

export const clusterNodes: Check<ClusterData> = ({ actions, cluster, now }) => {
  const down = cluster.nodes.filter((node) => !isActive(node.status));
  if (down.length === 0) {
    return [
      finding(
        "ok",
        "nodes",
        cluster.nodes.length === 1
          ? "Its 1 node is Active"
          : `All ${plural(cluster.nodes.length, "node")} are Active`,
        {
          evidence: cluster.nodes.map(
            (n) => `node ${n.name} status: ${n.status}`
          ),
        }
      ),
    ];
  }
  return down.map((node) => {
    const role = node.role ? ` (${node.role})` : "";
    const read = actions.get(node.id);
    const [latest] = read?.ok ? read.value : [];
    const evidence = [`node ${node.name} status: ${node.status}`];
    if (latest && actionFailed(latest)) {
      evidence.push(`last action: ${describeAction(latest, now)}`);
    }
    const next = [nextCommand("nipa", "investigate", node.id)];
    if (isChanging(node.status)) {
      return finding(
        "warning",
        "nodes",
        `Node ${node.name}${role} is in ${statusLabel(node.status)}`,
        { evidence, next }
      );
    }
    const state =
      node.status.toUpperCase() === "SHUTOFF"
        ? "is shut off"
        : `is in ${statusLabel(node.status)}`;
    return finding("problem", "nodes", `Node ${node.name}${role} ${state}`, {
      evidence,
      next,
    });
  });
};

export const clusterMasters: Check<ClusterData> = ({ cluster }) => {
  const masters = cluster.nodes.filter((node) => node.role === "master");
  if (masters.length === 0 || masters.some((m) => isActive(m.status))) {
    return [];
  }
  return [
    finding("problem", "masters", "No master node is Active", {
      evidence: masters.map((m) => `master ${m.name} status: ${m.status}`),
    }),
  ];
};

export const clusterQuotas: Check<ClusterData> = ({
  actions,
  cluster,
  quotas,
}) => {
  const failedCreate = [...actions.values()].some(failedQuotaAction);
  const failing = cluster.nodes.some(
    (node) => isFailing(node.status) || isChanging(node.status)
  );
  if (!(quotas.ok && (failedCreate || failing))) {
    return [];
  }
  return quotaFindings({
    failedCreate,
    quotas: quotas.value,
    refs: [
      ...COMPUTE_QUOTAS,
      {
        group: "container",
        label: "Kubernetes clusters",
        name: "kubernetes_cluster",
      },
    ],
  });
};

export const clusterReads: Check<ClusterData> = (data) =>
  readFailures([
    ...[...data.actions].map(([id, read]) => {
      const node = data.cluster.nodes.find((n) => n.id === id);
      return [`node ${node?.name ?? id}'s actions`, read] as const;
    }),
    [QUOTAS, data.quotas],
  ]);

/** Every check, by kind, in the order the human view lists a severity's findings. */
export const CHECKS = {
  db: [dbHealth, dbLogs, dbQuotas, dbReads],
  k8s: [clusterMasters, clusterNodes, clusterQuotas, clusterReads],
  lb: [lbStatus, lbServing, lbQuotas, lbReads],
  server: [
    serverStatus,
    serverActions,
    serverTask,
    serverConsole,
    serverVolumes,
    serverAddress,
    serverLock,
    serverQuotas,
    serverReads,
  ],
  volume: [volumeStatus, volumeAttachments, volumeQuotas, volumeReads],
} as const satisfies {
  [K in InvestigatedKind]: readonly Check<KindData[K]>[];
};

const OPERATORS = "which only Nipa Cloud's operators can read";

/** What nipa can't read for each kind, so a clean result never claims it. */
export const CANNOT_SEE: Record<InvestigatedKind, readonly string[]> = {
  db: [
    "the database's log lines and queries, because the Space API sends each log's state and not its contents",
    `the database host's own logs, ${OPERATORS}`,
  ],
  k8s: [
    "Kubernetes itself, such as pods, node conditions and the API server, because nipa sees a cluster only through the servers Magnum made for it",
    "the Magnum cluster's own status and events, because the Space API has no Kubernetes endpoint",
  ],
  lb: [
    "the traffic itself and what a member answers to its health check",
    `the load balancer's own logs, ${OPERATORS}`,
  ],
  server: [
    "what runs inside the server beyond the last 100 console log lines",
    `the hypervisor and its logs, ${OPERATORS}`,
  ],
  volume: [
    "the file system inside the volume",
    `the storage backend and its logs, ${OPERATORS}`,
  ],
};

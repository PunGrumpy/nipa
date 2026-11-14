import { describe, expect, test } from "bun:test";

import type { Server, ServerAction } from "../../../src/util/compute";
import type { DatabaseDetail } from "../../../src/util/database";
import type { Finding, Read } from "../../../src/util/findings";
import {
  CANNOT_SEE,
  CHECKS,
  clusterMasters,
  clusterNodes,
  clusterQuotas,
  clusterReads,
  dbHealth,
  dbLogs,
  dbQuotas,
  dbReads,
  lbQuotas,
  lbReads,
  lbServing,
  lbStatus,
  serverActions,
  serverAddress,
  serverConsole,
  serverLock,
  serverQuotas,
  serverReads,
  serverStatus,
  serverTask,
  serverVolumes,
  STUCK_TASK_MS,
  volumeAttachments,
  volumeQuotas,
  volumeReads,
  volumeStatus,
} from "../../../src/util/investigate-checks";
import type {
  ClusterData,
  DatabaseData,
  LoadBalancerData,
  ServerData,
  VolumeData,
} from "../../../src/util/investigate-checks";
import type { LoadBalancerDetail } from "../../../src/util/load-balancer";
import type { Quota } from "../../../src/util/quota";
import type { Volume } from "../../../src/util/volume";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const MINUTE = 60_000;

const ok = <T>(value: T): Read<T> => ({ ok: true, value });
const failed = (reason: string): Read<never> => ({ ok: false, reason });

/** What a test asserts on: each finding's severity, check and summary. */
const brief = (findings: readonly Finding[]) =>
  findings.map((f) => [f.severity, f.check, f.summary]);

const QUOTAS: Quota[] = [
  { group: "compute", limit: 10, name: "instances", unit: null, used: 10 },
  { group: "compute", limit: 20, name: "cores", unit: null, used: 18 },
  { group: "compute", limit: 51_200, name: "ram", unit: "MB", used: 20_000 },
  { group: "storage", limit: 10, name: "volumes", unit: null, used: 10 },
  {
    group: "loadBalancer",
    limit: 2,
    name: "load_balancer",
    unit: null,
    used: 2,
  },
  {
    group: "sqlDatabase",
    limit: 3,
    name: "database_instances",
    unit: null,
    used: 3,
  },
  {
    group: "container",
    limit: 1,
    name: "kubernetes_cluster",
    unit: null,
    used: 1,
  },
];

const SERVER: Server = {
  addresses: [{ address: "192.0.2.5", type: "fixed", version: 4 }],
  createdAt: "2026-11-01T00:00:00Z",
  flavor: "csa.large.v2",
  id: "s1",
  kubernetes: null,
  name: "web-1",
  ramMb: 4096,
  securityGroups: [],
  status: "ACTIVE",
  vcpus: 2,
  volumes: [
    {
      attachedAs: "boot disk",
      id: "v1",
      name: "web-1-vol-0",
      sizeGb: 10,
      type: null,
    },
  ],
  zone: null,
};

const action = (
  name: string,
  agoMs: number,
  remark: string | null = null
): ServerAction => ({
  action: name,
  remark,
  requestId: `req-${name}`,
  startedAt: new Date(NOW - agoMs).toISOString(),
  user: "Ann Example",
});

const volume = (more: Partial<Volume> = {}): Volume => ({
  attachments: [{ device: "/dev/vda", serverId: "s1" }],
  bootable: true,
  createdAt: "2026-11-01T00:00:00Z",
  id: "v1",
  name: "web-1-vol-0",
  sizeGb: 10,
  status: "in-use",
  type: null,
  zone: "NCP-BKK",
  ...more,
});

const server = (more: Partial<ServerData> = {}): ServerData => ({
  actions: ok([action("start", 2 * MINUTE)]),
  consoleLog: ok({ kind: "log", text: "boot\nweb-1 login: " }),
  now: NOW,
  quotas: ok(QUOTAS),
  ref: "web-1",
  server: SERVER,
  state: ok({ locked: false, status: "ACTIVE", taskState: null }),
  volumes: ok([volume()]),
  ...more,
});

const serverAt = (status: string) =>
  brief(serverStatus(server({ server: { ...SERVER, status } })));

const stoppedBy = (status: string, name: string) =>
  serverStatus(
    server({
      actions: ok([action(name, 3 * 60 * MINUTE)]),
      server: { ...SERVER, status },
    })
  );

const withActions = (status: string, actions: ServerAction[]) =>
  brief(
    serverStatus(
      server({ actions: ok(actions), server: { ...SERVER, status } })
    )
  );

describe("server checks", () => {
  test("a healthy server has no problem or warning", () => {
    const findings = CHECKS.server.flatMap((check) => check(server()));
    expect(findings.filter((f) => f.severity !== "ok")).toEqual([]);
    expect(brief(findings)).toEqual([
      ["ok", "status", "web-1 is Active"],
      ["ok", "actions", "The last action, start, worked"],
      [
        "ok",
        "console-log",
        "The console log shows no kernel panic, out-of-memory, cloud-init or full-disk lines",
      ],
      ["ok", "volumes", "Its 1 volume is In use"],
      ["ok", "address", "web-1 has an IP address"],
    ]);
  });

  test("status: Error is a problem that points to history and logs", () => {
    const [found] = serverStatus(
      server({ server: { ...SERVER, status: "ERROR" } })
    );
    expect(found).toMatchObject({
      evidence: ["status: ERROR"],
      severity: "problem",
      summary: "web-1 is in Error",
    });
    expect(found?.next.map((n) => n.command)).toEqual([
      "nipa server history web-1",
      "nipa server logs web-1",
    ]);
  });

  test("status: shut off is a problem, building is a warning, the rest isn't Active", () => {
    expect(serverAt("SHUTOFF")).toEqual([
      ["problem", "status", "web-1 is shut off"],
    ]);
    expect(serverAt("BUILD")).toEqual([
      ["warning", "status", "web-1 is in Build and not running yet"],
    ]);
    expect(serverAt("SUSPENDED")).toEqual([
      ["problem", "status", "web-1 is Suspended, not Active"],
    ]);
  });

  test("status: a stop, shelve, suspend or pause that worked is a warning naming who and when", () => {
    const [shutOff] = stoppedBy("SHUTOFF", "stop");
    expect(shutOff).toMatchObject({
      severity: "warning",
      summary:
        "web-1 is shut off, and the latest action, stop 3h ago by Ann Example, worked",
    });
    expect(shutOff?.evidence).toEqual([
      "status: SHUTOFF",
      "action: stop",
      "remark: none",
      "request: req-stop",
      expect.stringMatching(/^started: /u),
      "user: Ann Example",
    ]);
    expect(shutOff?.next[0]?.command).toBe("nipa server start web-1");
    expect(brief(stoppedBy("SHELVED_OFFLOADED", "shelveOffload"))).toEqual([
      [
        "warning",
        "status",
        "web-1 is Shelved offloaded, and the latest action, shelveOffload 3h ago by Ann Example, worked",
      ],
    ]);
    expect(brief(stoppedBy("SHELVED", "shelve"))[0]?.[0]).toBe("warning");
    expect(brief(stoppedBy("SUSPENDED", "suspend"))[0]?.[0]).toBe("warning");
    expect(brief(stoppedBy("PAUSED", "pause"))[0]?.[0]).toBe("warning");
  });

  test("status: stopped with no matching action, or a failed one, stays a problem", () => {
    expect(withActions("SHUTOFF", [action("reboot", MINUTE)])).toEqual([
      ["problem", "status", "web-1 is shut off"],
    ]);
    expect(withActions("SHUTOFF", [action("stop", MINUTE, "Error")])).toEqual([
      ["problem", "status", "web-1 is shut off"],
    ]);
    expect(withActions("SUSPENDED", [action("stop", MINUTE)])).toEqual([
      ["problem", "status", "web-1 is Suspended, not Active"],
    ]);
    expect(withActions("PAUSED", [])).toEqual([
      ["problem", "status", "web-1 is Paused, not Active"],
    ]);
  });

  test("task: a running task is a warning, one long after the last action is a problem", () => {
    const busy = { locked: false, status: "BUILD", taskState: "spawning" };
    expect(
      brief(
        serverTask(
          server({ actions: ok([action("create", MINUTE)]), state: ok(busy) })
        )
      )
    ).toEqual([["warning", "task", "web-1 is busy: spawning"]]);
    const stuck = serverTask(
      server({
        actions: ok([action("create", STUCK_TASK_MS + 3 * 60 * MINUTE)]),
        state: ok(busy),
      })
    );
    expect(brief(stuck)).toEqual([
      [
        "problem",
        "task",
        "web-1's task, spawning, hasn't finished in the 4h since its last action, create",
      ],
    ]);
    expect(stuck[0]?.evidence[0]).toBe("task_state: spawning");
    expect(
      serverTask(server({ state: failed("Service Unavailable") }))
    ).toEqual([]);
  });

  test("lock: a locked server is a warning", () => {
    const locked = ok({ locked: true, status: "ACTIVE", taskState: null });
    expect(serverLock(server({ state: locked }))).toMatchObject([
      { evidence: ["locked: true"], severity: "warning" },
    ]);
    expect(serverLock(server())).toEqual([]);
  });

  test("actions: the latest failed action is a problem with who and when", () => {
    const [found] = serverActions(
      server({ actions: ok([action("create", 26 * MINUTE, "Error")]) })
    );
    expect(found).toMatchObject({
      severity: "problem",
      summary: "Create failed 26m ago by Ann Example",
    });
    expect(found?.evidence).toContain("remark: Error");
    expect(found?.evidence).toContain("user: Ann Example");
    expect(serverActions(server({ actions: ok([]) }))).toEqual([]);
    const [worked] = serverActions(
      server({ actions: ok([action("start", MINUTE, "Success")]) })
    );
    expect(worked?.evidence).toEqual(["action: start", "remark: Success"]);
  });

  test("console log: each kind of failure line is a problem that quotes it", () => {
    const text = [
      "[ 1.0] Kernel panic - not syncing: VFS: Unable to mount root fs",
      "[ 2.0] Out of memory: Killed process 812 (java)",
      "[ 3.0] cloud-init[812]: Failed to run module scripts-user",
      "[ 4.0] cloud-init[812]: ci-info: no authorized SSH keys fingerprints found",
      "write error: No space left on device",
    ].join("\n");
    const findings = serverConsole(
      server({ consoleLog: ok({ kind: "log", text }) })
    );
    expect(brief(findings)).toEqual([
      ["problem", "console-log", "The console log shows a kernel panic"],
      [
        "problem",
        "console-log",
        "The console log shows the kernel killing processes for lack of memory",
      ],
      ["problem", "console-log", "The console log shows a cloud-init failure"],
      ["problem", "console-log", "The console log shows a full disk"],
    ]);
    expect(findings[2]?.evidence).toEqual([
      "[ 3.0] cloud-init[812]: Failed to run module scripts-user",
    ]);
    expect(findings[0]?.next[0]?.command).toBe("nipa server logs web-1");
  });

  test("console log: cloud-init's ordinary warnings aren't a failure", () => {
    const text = [
      "[ 5.0] cloud-init[650]: 2026-11-14 08:00:01,000 - url_helper.py[WARNING]: Calling 'http://[fe80::a9fe:a9fe%25ens3]/openstack' failed [0/-1s]: request error",
      "[ 6.0] cloud-init[900]: 2026-11-14 08:00:02,000 - util.py[WARNING]: Failed to set ssh_pwauth",
    ].join("\n");
    expect(
      brief(serverConsole(server({ consoleLog: ok({ kind: "log", text }) })))
    ).toEqual([
      [
        "ok",
        "console-log",
        "The console log shows no kernel panic, out-of-memory, cloud-init or full-disk lines",
      ],
    ]);
  });

  test("console log: a cloud-init traceback, error, failed module or script, or failed start is a problem", () => {
    for (const line of [
      "[ 7.0] cloud-init[650]: Traceback (most recent call last):",
      "[ 7.0] cloud-init[650]: 2026-11-14 08:00:03,000 - main.py[CRITICAL]: Failed to read user data",
      "[ 7.0] cloud-init[650]: util.py[WARNING]: Running module scripts_user (<module 'cloudinit.config.cc_scripts_user'>) failed",
      "[ 7.0] cloud-init[650]: cc_scripts_user.py[WARNING]: Failed to run module scripts_user (scripts in /var/lib/cloud/instance/scripts)",
      "[ 7.0] cloud-init[650]: subp.py[WARNING]: Failed running /var/lib/cloud/instance/scripts/part-001 [1]",
      "[FAILED] Failed to start Initial cloud-init job (pre-networking).",
      "[FAILED] Failed to start Execute cloud user/final scripts.",
    ]) {
      expect(
        brief(
          serverConsole(server({ consoleLog: ok({ kind: "log", text: line }) }))
        )
      ).toEqual([
        [
          "problem",
          "console-log",
          "The console log shows a cloud-init failure",
        ],
      ]);
    }
  });

  test("console log: none is a warning, and a failed read adds nothing here", () => {
    expect(
      brief(serverConsole(server({ consoleLog: ok({ kind: "none" }) })))
    ).toEqual([
      [
        "warning",
        "console-log",
        "web-1 has no console log. The Space API keeps one only for a server that booted",
      ],
    ]);
    expect(serverConsole(server({ consoleLog: failed("boom") }))).toEqual([]);
  });

  test("volumes: one not In use is named, and one in Error is a problem", () => {
    expect(
      brief(
        serverVolumes(server({ volumes: ok([volume({ status: "error" })]) }))
      )
    ).toEqual([
      ["problem", "volumes", "Volume web-1-vol-0 is Error, not In use"],
    ]);
    expect(
      brief(
        serverVolumes(
          server({ volumes: ok([volume({ status: "available" })]) })
        )
      )
    ).toEqual([
      ["warning", "volumes", "Volume web-1-vol-0 is Available, not In use"],
    ]);
    expect(brief(serverVolumes(server({ volumes: ok([]) })))).toEqual([
      [
        "warning",
        "volumes",
        "Volume web-1-vol-0 isn't in the project's volume list",
      ],
    ]);
  });

  test("address: a server without one is a problem", () => {
    expect(
      brief(serverAddress(server({ server: { ...SERVER, addresses: [] } })))
    ).toEqual([["problem", "address", "web-1 has no IP address"]]);
  });

  test("quotas: matter only when a create failed or the server isn't running", () => {
    expect(serverQuotas(server())).toEqual([]);
    const failedCreate = server({
      actions: ok([action("create", MINUTE, "Error")]),
      server: { ...SERVER, status: "ERROR" },
    });
    expect(brief(serverQuotas(failedCreate))).toEqual([
      [
        "problem",
        "quota",
        "The project uses 10 of its 10 servers, so one more fails to create",
      ],
      [
        "warning",
        "quota",
        "The project uses 18 of its 20 vCPUs, near the quota",
      ],
    ]);
  });

  test("reads: each failed read is a warning naming what and why", () => {
    const findings = serverReads(
      server({
        actions: failed("Internal Server Error"),
        quotas: failed("Forbidden"),
      })
    );
    expect(findings.map((f) => [f.summary, f.evidence])).toEqual([
      [
        "nipa couldn't read the server's actions",
        ["error: Internal Server Error"],
      ],
      ["nipa couldn't read the quotas", ["error: Forbidden"]],
    ]);
  });
});

const lbDetail = (
  more: Partial<LoadBalancerDetail> = {}
): LoadBalancerDetail => ({
  address: "192.0.2.30",
  backendGroups: [
    {
      algorithm: "ROUND_ROBIN",
      health: "ONLINE",
      healthCheck: null,
      id: "pool-1",
      members: [
        {
          address: "192.0.2.5",
          backup: false,
          health: "ONLINE",
          id: "m1",
          name: "web-1",
          port: 80,
          status: "ACTIVE",
          weight: 1,
        },
      ],
      name: "web-pool",
      protocol: "HTTP",
      status: "ACTIVE",
    },
  ],
  createdAt: "2026-11-01T00:00:00Z",
  externalAddress: null,
  flavor: null,
  health: "ONLINE",
  id: "lb-1",
  listenerDetails: [
    {
      allowedCidrs: [],
      backendGroupId: "pool-1",
      health: "ONLINE",
      id: "l1",
      name: "web-http",
      port: 80,
      protocol: "HTTP",
      status: "ACTIVE",
    },
  ],
  name: "web-lb",
  status: "ACTIVE",
  ...more,
});

const lb = (more: Partial<LoadBalancerData> = {}): LoadBalancerData => ({
  detail: ok(lbDetail()),
  lb: {
    address: "192.0.2.30",
    createdAt: "2026-11-01T00:00:00Z",
    health: "ONLINE",
    id: "lb-1",
    listeners: 1,
    name: "web-lb",
    status: "ACTIVE",
  },
  now: NOW,
  quotas: ok(QUOTAS),
  ref: "web-lb",
  ...more,
});

const lbAt = (status: string) =>
  brief(lbStatus(lb({ lb: { ...lb().lb, status } })));

describe("load balancer checks", () => {
  test("a healthy load balancer passes status and serving", () => {
    expect(brief(CHECKS.lb.flatMap((check) => check(lb())))).toEqual([
      ["ok", "status", "web-lb is Active"],
      ["ok", "serving", "All listeners and members are healthy"],
    ]);
  });

  test("status: Error is a problem, Pending create a warning", () => {
    expect(lbAt("ERROR")).toEqual([
      ["problem", "status", "web-lb is in Error"],
    ]);
    expect(lbAt("PENDING_CREATE")).toEqual([
      ["warning", "status", "web-lb is still being set up: Pending create"],
    ]);
    expect(lbAt("PENDING_UPDATE")).toEqual([
      ["warning", "status", "web-lb is being updated: Pending update"],
    ]);
    expect(lbAt("PENDING_DELETE")).toEqual([
      ["warning", "status", "web-lb is being deleted: Pending delete"],
    ]);
  });

  test("serving: diagnose's verdict, with the parts that don't serve as evidence", () => {
    const detail = lbDetail();
    const [group] = detail.backendGroups;
    const broken = lbDetail({
      backendGroups: group
        ? [
            {
              ...group,
              members: group.members.map((m) => ({ ...m, health: "ERROR" })),
            },
          ]
        : [],
    });
    const [found] = lbServing(lb({ detail: ok(broken) }));
    expect(found).toMatchObject({
      evidence: [
        "member web-1: provisioning_status ACTIVE, operating_status ERROR",
      ],
      severity: "problem",
      summary: "The member is down",
    });
    expect(found?.next[0]?.command).toBe("nipa lb inspect web-lb");
    const updating = lbServing(
      lb({
        detail: ok(broken),
        lb: { ...lb().lb, status: "PENDING_UPDATE" },
      })
    );
    expect(updating).toMatchObject([
      { severity: "warning", summary: "The member is down" },
    ]);
    const empty = lbServing(
      lb({ detail: ok(lbDetail({ listenerDetails: [] })) })
    );
    expect(empty[0]?.evidence[0]).toBe("listeners: none");
  });

  test("quotas matter only while it's being made or failed", () => {
    expect(lbQuotas(lb())).toEqual([]);
    const pending = lb({ lb: { ...lb().lb, status: "PENDING_CREATE" } });
    expect(brief(lbQuotas(pending))).toEqual([
      [
        "warning",
        "quota",
        "The project uses 2 of its 2 load balancers, so one more fails to create",
      ],
    ]);
    // Octavia rejects an over-quota create at the API, so a full quota doesn't
    // explain a load balancer in Error.
    const errored = lb({ lb: { ...lb().lb, status: "ERROR" } });
    expect(brief(lbQuotas(errored))).toEqual([
      [
        "warning",
        "quota",
        "The project uses 2 of its 2 load balancers, so one more fails to create",
      ],
    ]);
  });

  test("reads: a failed detail read is a warning", () => {
    expect(
      brief(lbReads(lb({ detail: failed("Service Unavailable") })))
    ).toEqual([
      [
        "warning",
        "read",
        "nipa couldn't read the listeners, backend groups and members",
      ],
    ]);
  });
});

const DATABASE: DatabaseDetail = {
  backups: [
    {
      createdAt: "2026-11-13T00:00:00Z",
      id: "b1",
      name: "nightly",
      sizeGb: 0.2,
      status: "COMPLETED",
    },
  ],
  createdAt: "2026-11-01T00:00:00Z",
  defaultPort: 3306,
  id: "db-1",
  logs: [
    {
      enabled: true,
      name: "slow_query",
      publishedBytes: 0,
      status: "Published",
    },
  ],
  name: "orders",
  primary: {
    address: "192.0.2.20",
    allowedCidrs: [],
    engine: "mysql",
    externalAddress: null,
    flavor: "dsa.large.v1",
    health: "HEALTHY",
    healthCheckedAt: null,
    id: "p1",
    ramMb: 4096,
    status: "ACTIVE",
    storageGb: 10,
    vcpus: 2,
    version: "8.0",
    zone: null,
  },
  replicas: [
    {
      address: "192.0.2.22",
      health: "HEALTHY",
      id: "r1",
      name: "orders-replica-1",
      status: "ACTIVE",
    },
  ],
};

const db = (
  more: Partial<DatabaseDetail> = {},
  data: Partial<DatabaseData> = {}
): DatabaseData => ({
  database: { ...DATABASE, ...more },
  failures: [],
  now: NOW,
  quotas: ok(QUOTAS),
  ref: "orders",
  ...data,
});

describe("database checks", () => {
  test("a healthy database passes", () => {
    expect(brief(CHECKS.db.flatMap((check) => check(db())))).toEqual([
      ["ok", "health", "The primary is Active and Healthy"],
    ]);
  });

  test("health: a failed replica and a failed backup are problems", () => {
    const findings = dbHealth(
      db({
        backups: [
          {
            ...DATABASE.backups?.[0],
            createdAt: "",
            id: "b1",
            name: "nightly",
            sizeGb: null,
            status: "FAILED",
          },
        ],
        replicas: [
          {
            address: null,
            health: "UNKNOWN",
            id: "r1",
            name: "orders-replica-1",
            status: "ERROR",
          },
        ],
      })
    );
    expect(findings.map((f) => [f.severity, f.summary, f.evidence])).toEqual([
      [
        "problem",
        "orders-replica-1's status is Error",
        ["replica orders-replica-1 status: ERROR"],
      ],
      [
        "problem",
        "The latest backup, nightly, failed",
        ["backup nightly status: FAILED"],
      ],
    ]);
    expect(findings[0]?.next[0]?.command).toBe("nipa db inspect orders");
  });

  test("health: a primary Trove still builds is a warning, and no primary a problem", () => {
    const primary = DATABASE.primary && {
      ...DATABASE.primary,
      health: "UNKNOWN",
      status: "BUILD",
    };
    expect(brief(dbHealth(db({ primary, replicas: [] })))).toEqual([
      ["warning", "health", "The primary's status is Build"],
      ["warning", "health", "The primary's health is Unknown"],
    ]);
    expect(dbHealth(db({ primary: null }))).toMatchObject([
      {
        evidence: ["primary: none"],
        severity: "problem",
        summary: "The cluster has no primary yet",
      },
    ]);
  });

  test("logs: a log in Error is a problem", () => {
    expect(
      brief(
        dbLogs(
          db({
            logs: [
              {
                enabled: true,
                name: "slow_query",
                publishedBytes: 0,
                status: "Error",
              },
            ],
          })
        )
      )
    ).toEqual([["problem", "logs", "The slow query log is Error"]]);
  });

  test("quotas matter only while it has no running primary", () => {
    expect(dbQuotas(db())).toEqual([]);
    const failedPrimary = DATABASE.primary
      ? { ...DATABASE.primary, status: "ERROR" }
      : null;
    expect(brief(dbQuotas(db({ primary: failedPrimary })))).toEqual([
      [
        "warning",
        "quota",
        "The project uses 3 of its 3 databases, so one more fails to create",
      ],
    ]);
    expect(brief(dbQuotas(db({ primary: null })))).toEqual([
      [
        "warning",
        "quota",
        "The project uses 3 of its 3 databases, so one more fails to create",
      ],
    ]);
  });

  test("reads: a part the Space API didn't answer for is a warning", () => {
    expect(
      brief(
        dbReads(
          db(
            {},
            { failures: [{ part: "backups", reason: "Internal Server Error" }] }
          )
        )
      )
    ).toEqual([["warning", "read", "nipa couldn't read the backups"]]);
  });
});

const vol = (
  more: Partial<Volume> = {},
  data: Partial<VolumeData> = {}
): VolumeData => ({
  now: NOW,
  quotas: ok(QUOTAS),
  ref: "web-1-vol-0",
  servers: ok([SERVER]),
  volume: volume(more),
  ...data,
});

describe("volume checks", () => {
  test("an attached volume passes and points to its server", () => {
    const findings = CHECKS.volume.flatMap((check) => check(vol()));
    expect(brief(findings)).toEqual([
      ["ok", "status", "web-1-vol-0 is In use"],
      ["ok", "attachments", "Attached to web-1 at /dev/vda"],
    ]);
    expect(findings[1]?.next[0]?.command).toBe("nipa investigate s1");
  });

  test("status: Error is a problem, Creating a warning", () => {
    expect(brief(volumeStatus(vol({ status: "error_extending" })))).toEqual([
      ["problem", "status", "web-1-vol-0 is in Error extending"],
    ]);
    expect(brief(volumeStatus(vol({ name: "", status: "creating" })))).toEqual([
      ["warning", "status", "v1 is Creating"],
    ]);
  });

  test("attachments: In use with none, or to a server that's gone, is a problem", () => {
    expect(brief(volumeAttachments(vol({ attachments: [] })))).toEqual([
      [
        "problem",
        "attachments",
        "web-1-vol-0 is In use but attached to no server",
      ],
    ]);
    expect(brief(volumeAttachments(vol({}, { servers: ok([]) })))).toEqual([
      [
        "problem",
        "attachments",
        "web-1-vol-0 is attached to server s1, which isn't in the project's server list",
      ],
    ]);
  });

  test("quotas matter only while it's being made or failed", () => {
    expect(volumeQuotas(vol())).toEqual([]);
    expect(brief(volumeQuotas(vol({ status: "error" })))).toEqual([
      [
        "warning",
        "quota",
        "The project uses 10 of its 10 volumes, so one more fails to create",
      ],
    ]);
  });

  test("reads: a failed server read is a warning", () => {
    expect(brief(volumeReads(vol({}, { servers: failed("x") })))).toEqual([
      ["warning", "read", "nipa couldn't read the servers"],
    ]);
  });
});

const node = (
  name: string,
  status: string,
  role: string | null = "worker"
) => ({
  id: `${name}-id`,
  name,
  role,
  status,
});

const cluster = (
  nodes: ReturnType<typeof node>[],
  data: Partial<ClusterData> = {}
): ClusterData => ({
  actions: new Map(),
  cluster: {
    createdAt: "2026-11-01T00:00:00Z",
    id: "c1",
    nodes,
    version: "1.34.9",
  },
  now: NOW,
  quotas: ok(QUOTAS),
  ref: "c1",
  ...data,
});

describe("Kubernetes cluster checks", () => {
  test("a cluster with every node Active passes", () => {
    const healthy = cluster([
      node("cp-1", "ACTIVE", "master"),
      node("w-1", "ACTIVE"),
    ]);
    expect(brief(CHECKS.k8s.flatMap((check) => check(healthy)))).toEqual([
      ["ok", "nodes", "All 2 nodes are Active"],
    ]);
  });

  test("nodes: a single Active node reads in the singular", () => {
    expect(brief(clusterNodes(cluster([node("w-1", "ACTIVE")])))).toEqual([
      ["ok", "nodes", "Its 1 node is Active"],
    ]);
  });

  test("nodes: one in Error is a problem with its failed action, building a warning", () => {
    const data = cluster(
      [
        node("cp-1", "ACTIVE", "master"),
        node("w-1", "ERROR"),
        node("w-2", "BUILD"),
      ],
      {
        actions: new Map([
          ["w-1-id", ok([action("create", 61 * 24 * 60 * MINUTE, "Error")])],
        ]),
      }
    );
    const findings = clusterNodes(data);
    expect(findings.map((f) => [f.severity, f.summary, f.evidence])).toEqual([
      [
        "problem",
        "Node w-1 (worker) is in Error",
        [
          "node w-1 status: ERROR",
          "last action: create failed 61d ago by Ann Example",
        ],
      ],
      ["warning", "Node w-2 (worker) is in Build", ["node w-2 status: BUILD"]],
    ]);
    expect(findings[0]?.next[0]?.command).toBe("nipa investigate w-1-id");
    expect(
      brief(clusterNodes(cluster([node("old", "SHUTOFF", null)])))
    ).toEqual([["problem", "nodes", "Node old is shut off"]]);
  });

  test("masters: none Active is a problem", () => {
    expect(
      brief(clusterMasters(cluster([node("cp-1", "SHUTOFF", "master")])))
    ).toEqual([["problem", "masters", "No master node is Active"]]);
    expect(clusterMasters(cluster([node("w-1", "ERROR")]))).toEqual([]);
  });

  test("quotas: a node whose create failed makes a full quota a problem", () => {
    const data = cluster([node("w-1", "ERROR")], {
      actions: new Map([["w-1-id", ok([action("create", MINUTE, "Error")])]]),
    });
    expect(brief(clusterQuotas(data))).toEqual([
      [
        "problem",
        "quota",
        "The project uses 10 of its 10 servers, so one more fails to create",
      ],
      [
        "warning",
        "quota",
        "The project uses 18 of its 20 vCPUs, near the quota",
      ],
      [
        "problem",
        "quota",
        "The project uses 1 of its 1 Kubernetes clusters, so one more fails to create",
      ],
    ]);
    expect(clusterQuotas(cluster([node("w-1", "ACTIVE")]))).toEqual([]);
  });

  test("reads: a node whose actions failed to load is a warning", () => {
    const data = cluster([node("w-1", "ERROR")], {
      actions: new Map([["w-1-id", failed("Internal Server Error")]]),
    });
    expect(brief(clusterReads(data))).toEqual([
      ["warning", "read", "nipa couldn't read node w-1's actions"],
    ]);
  });
});

describe("CANNOT_SEE", () => {
  test("every kind names what nipa can't see, and none offers operator access", () => {
    for (const lines of Object.values(CANNOT_SEE)) {
      expect(lines.length).toBeGreaterThan(0);
    }
    expect(CANNOT_SEE.server).toContain(
      "the hypervisor and its logs, which only Nipa Cloud's operators can read"
    );
  });
});

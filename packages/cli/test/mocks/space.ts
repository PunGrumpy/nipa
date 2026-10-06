// A fake of Nipa Cloud's Space API. The fake Keystone serves it under /api
// after it checks the token. One project owns every resource here, and the
// other projects have none.

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

const ago = (ms: number): string => new Date(Date.now() - ms).toISOString();

const flavor = (name: string) => ({
  disk: 0,
  id: `flavor-${name}`,
  name,
  ram: 4096,
  vcpus: 2,
});

const ip = (address: string) => ({ address });

// web-1's floating IP, which FAKE_IPS lists too.
const WEB_1_IP = "203.0.113.10";

/** The servers, newest first, the way the Space API lists them. */
export const FAKE_SERVERS = [
  {
    ageMs: 2 * MINUTE_MS,
    external_ips: [],
    flavor: flavor("csa.large.v2"),
    id: "33333333-3333-4333-8333-333333333333",
    internal_ips: [ip("192.0.2.7")],
    name: "web-2",
    status: "BUILD",
  },
  {
    "OS-EXT-AZ:availability_zone": "NCP-BKK",
    ageMs: 3 * DAY_MS,
    external_ips: [ip(WEB_1_IP)],
    flavor: flavor("csa.large.v2"),
    id: "22222222-2222-4222-8222-222222222222",
    internal_ips: [ip("192.0.2.5"), ip("2001:db8::5")],
    name: "web-1",
    security_groups: ["default", "web"],
    status: "ACTIVE",
    volumes: [
      {
        attached_as: "boot disk",
        id: "vvvv1111-0000-4000-8000-000000000001",
        name: "web-1-vol-0",
        size: 10,
        volume_type: "Standard_SSD",
      },
    ],
  },
  {
    ageMs: 40 * DAY_MS,
    external_ips: [],
    flavor: flavor("csa.xlarge.v2"),
    id: "11111111-1111-4111-8111-111111111111",
    internal_ips: [ip("198.51.100.4")],
    name: "db-1",
    status: "SHUTOFF",
  },
  {
    ageMs: 60 * DAY_MS,
    external_ips: [],
    flavor: flavor("csa.xlarge.v2"),
    id: "44444444-4444-4444-8444-444444444444",
    internal_ips: [ip("198.51.100.9")],
    metadata: {
      kube_version: "1.34.9",
      magnum_cluster_id: "dddd1111-0000-4000-8000-000000000001",
      magnum_role: "master",
    },
    name: "k8s-control-plane-1",
    status: "ACTIVE",
  },
];

const primary = (input: {
  engine: string;
  version: string;
  status: string;
  health: string;
  address: string;
  externalAddress: string | null;
}) => ({
  datastore_type: input.engine,
  datastore_version: input.version,
  external_ip_address: input.externalAddress,
  instance_status: input.status,
  ip_address: input.address,
  machine_type: { id: "mt1", name: "dsa.large.v1", ram: 4096, vcpus: 2 },
  operating_status: input.health,
  volume_size: 10,
});

/** The database clusters, oldest first, the way the Space API lists them. */
export const FAKE_DATABASES = [
  {
    ageMs: 30 * DAY_MS,
    host_name: "orders-aaaa1111",
    id: "aaaa1111-0000-4000-8000-000000000001",
    name: "orders",
    primary: primary({
      address: "192.0.2.20",
      engine: "mysql",
      externalAddress: "203.0.113.20",
      health: "HEALTHY",
      status: "ACTIVE",
      version: "8.0.34",
    }),
  },
  {
    ageMs: 5 * MINUTE_MS,
    host_name: "analytics-aaaa2222",
    id: "aaaa2222-0000-4000-8000-000000000002",
    name: "analytics",
    primary: primary({
      address: "192.0.2.21",
      engine: "postgresql",
      externalAddress: null,
      health: "UNKNOWN",
      status: "BUILD",
      version: "17.10",
    }),
  },
  {
    ageMs: MINUTE_MS,
    host_name: "cache-aaaa3333",
    id: "aaaa3333-0000-4000-8000-000000000003",
    name: "cache",
    primary: null,
  },
];

/** The load balancers, oldest first. */
export const FAKE_LOAD_BALANCERS = [
  {
    ageMs: 7 * DAY_MS,
    id: "bbbb1111-0000-4000-8000-000000000001",
    listeners: [{ id: "listener-1" }, { id: "listener-2" }],
    name: "web-lb",
    operating_status: "ONLINE",
    provider: "amphora",
    provisioning_status: "ACTIVE",
    vip_address: "192.0.2.30",
  },
  {
    ageMs: MINUTE_MS,
    id: "bbbb2222-0000-4000-8000-000000000002",
    listeners: [],
    name: "api-lb",
    operating_status: "OFFLINE",
    provider: "amphora",
    provisioning_status: "PENDING_CREATE",
    vip_address: "192.0.2.31",
  },
];

/** The external IPs. An IP without an internal address isn't attached. */
export const FAKE_IPS = [
  {
    availability_zone: "NCP-BKK",
    external_ip_address: WEB_1_IP,
    id: "cccc1111-0000-4000-8000-000000000001",
    internal_ip_address: "192.0.2.5",
    name: WEB_1_IP,
    status: "ACTIVE",
  },
  {
    availability_zone: "NCP-BKK",
    external_ip_address: "203.0.113.20",
    id: "cccc2222-0000-4000-8000-000000000002",
    internal_ip_address: "192.0.2.20",
    name: "orders's Public IP",
    status: "ACTIVE",
  },
  {
    availability_zone: "NCP-NON",
    external_ip_address: "203.0.113.99",
    id: "cccc3333-0000-4000-8000-000000000003",
    internal_ip_address: null,
    name: "spare",
    status: "DOWN",
  },
];

const createdAt = <T extends { ageMs: number }>({ ageMs, ...rest }: T) => ({
  ...rest,
  created_at: ago(ageMs),
});

interface Ask {
  /** Whether the project in the request owns the fake resources. */
  mine: boolean;
  query: URLSearchParams;
  /** Each server's status now, after the actions this fake has run. */
  statuses: ReadonlyMap<string, string>;
}

/** Each server's status, from FAKE_SERVERS. Actions change the copy. */
export const fakeStatuses = (): Map<string, string> =>
  new Map(FAKE_SERVERS.map((server) => [server.id, server.status]));

const routes = new Map<string, (ask: Ask) => object>([
  [
    "/api/v3/instances",
    ({ mine, statuses }) => {
      const servers = mine ? FAKE_SERVERS : [];
      return {
        instances: servers.map(({ ageMs, ...server }) => ({
          ...server,
          created: ago(ageMs),
          status: statuses.get(server.id) ?? server.status,
        })),
        page_control: { current_filter: {}, max_item: servers.length },
      };
    },
  ],
  [
    "/api/v4/database/clusters",
    ({ mine, query }) => {
      const clusters = mine ? FAKE_DATABASES.map(createdAt) : [];
      // Like the Space API, a cluster has its primary only when asked.
      return {
        database_clusters:
          query.get("include_primary") === "true"
            ? clusters
            : clusters.map(({ primary: _primary, ...cluster }) => cluster),
      };
    },
  ],
  [
    "/api/v4/loadbalancers",
    ({ mine }) => ({
      loadbalancers: mine ? FAKE_LOAD_BALANCERS.map(createdAt) : [],
    }),
  ],
  [
    "/api/v4/external_ips",
    ({ mine }) => ({ external_ips: mine ? FAKE_IPS : [], price: 0.18 }),
  ],
]);

export const spaceFault = (status: number, message: string): Response =>
  Response.json({ message, status }, { status });

// Nova's answer to an action the server's state doesn't allow.
const conflict = (action: string, id: string) =>
  spaceFault(
    409,
    `Cannot '${action}' instance ${id} while it is in this state`
  );

// What each action needs, and the status it leaves. Nova sets the task
// before it answers, and this fake finishes it at once.
const ACTIONS = new Map([
  ["restart", { after: "ACTIVE", from: "ACTIVE" }],
  ["start", { after: "ACTIVE", from: "SHUTOFF" }],
  ["stop", { after: "SHUTOFF", from: "ACTIVE" }],
]);

// db-1's state stops answering once an action reaches it, like a gateway
// that times out while Nova works.
const DB_1_ID = "11111111-1111-4111-8111-111111111111";

const INSTANCE =
  /^\/api\/v4\/instances\/(?<id>[^/]+)(?:\/action\/(?<action>[a-z_]+))?$/u;

const handleInstance = (input: {
  req: Request;
  mine: boolean;
  statuses: Map<string, string>;
  match: RegExpExecArray;
}): Response => {
  const id = input.match.groups?.id ?? "";
  const action = input.match.groups?.action;
  const status = input.mine ? input.statuses.get(id) : undefined;
  if (status === undefined) {
    return spaceFault(404, `Instance ${id} could not be found.`);
  }
  if (action === undefined && input.req.method === "GET") {
    if (id === DB_1_ID && status !== "SHUTOFF") {
      return spaceFault(503, "Service Unavailable");
    }
    return Response.json({ instance: { id, status, task_state: null } });
  }
  const rule = action === undefined ? undefined : ACTIONS.get(action);
  if (!rule || input.req.method !== "POST") {
    return spaceFault(405, "Method Not Allowed");
  }
  if (status !== rule.from) {
    return conflict(action ?? "", id);
  }
  input.statuses.set(id, rule.after);
  return new Response(null, { status: 202 });
};

/** Answers a Space API request whose token is valid, as `owner`'s resources. */
export const handleSpace = (input: {
  req: Request;
  owner: string;
  statuses: Map<string, string>;
}): Response => {
  const url = new URL(input.req.url);
  const projectId = input.req.headers.get("Project-Id");
  if (!projectId) {
    return spaceFault(
      400,
      "The 'project-id' header is required to access this API."
    );
  }
  const mine = projectId === input.owner;
  const instance = INSTANCE.exec(url.pathname);
  if (instance) {
    return handleInstance({
      match: instance,
      mine,
      req: input.req,
      statuses: input.statuses,
    });
  }
  const route = routes.get(url.pathname);
  if (!route) {
    return new Response("Not Found", { status: 404 });
  }
  return Response.json(
    route({ mine, query: url.searchParams, statuses: input.statuses })
  );
};

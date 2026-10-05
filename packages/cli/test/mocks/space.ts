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
    ageMs: 3 * DAY_MS,
    external_ips: [ip("203.0.113.10")],
    flavor: flavor("csa.large.v2"),
    id: "22222222-2222-4222-8222-222222222222",
    internal_ips: [ip("192.0.2.5"), ip("2001:db8::5")],
    name: "web-1",
    status: "ACTIVE",
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

const createdAt = <T extends { ageMs: number }>({ ageMs, ...rest }: T) => ({
  ...rest,
  created_at: ago(ageMs),
});

interface Ask {
  /** Whether the project in the request owns the fake resources. */
  mine: boolean;
  query: URLSearchParams;
}

const routes = new Map<string, (ask: Ask) => object>([
  [
    "/api/v3/instances",
    ({ mine }) => {
      const servers = mine ? FAKE_SERVERS : [];
      return {
        instances: servers.map(({ ageMs, ...server }) => ({
          ...server,
          created: ago(ageMs),
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
]);

export const spaceFault = (status: number, message: string): Response =>
  Response.json({ message, status }, { status });

/** Answers a Space API request whose token is valid, as `owner`'s resources. */
export const handleSpace = (input: {
  req: Request;
  owner: string;
}): Response => {
  const url = new URL(input.req.url);
  const route = routes.get(url.pathname);
  if (!route) {
    return new Response("Not Found", { status: 404 });
  }
  const projectId = input.req.headers.get("Project-Id");
  if (!projectId) {
    return spaceFault(
      400,
      "The 'project-id' header is required to access this API."
    );
  }
  return Response.json(
    route({ mine: projectId === input.owner, query: url.searchParams })
  );
};

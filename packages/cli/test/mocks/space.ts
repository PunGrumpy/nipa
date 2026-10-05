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

const routes = new Map<string, (mine: boolean) => object>([
  [
    "/api/v3/instances",
    (mine) => {
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
]);

export const spaceFault = (status: number, message: string): Response =>
  Response.json({ message, status }, { status });

/** Answers a Space API request whose token is valid, as `owner`'s resources. */
export const handleSpace = (input: {
  req: Request;
  pathname: string;
  owner: string;
}): Response => {
  const route = routes.get(input.pathname);
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
  return Response.json(route(projectId === input.owner));
};

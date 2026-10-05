// me@example.com has the MFA rule password + totp. plain@example.com has no MFA.
// The Space API is on the same server under /api, where Alpha has 3 servers
// and the other projects have none. With gateway, Keystone answers like Nipa's
// gateway: every 401 has an empty body, and a token without a catalog fails.

import { randomUUID } from "node:crypto";

import { z } from "zod";

export const FAKE_USER = { id: "u1", name: "me@example.com" };
export const PLAIN_USER = { id: "u2", name: "plain@example.com" };
export const FAKE_PASSWORD = "secret";
export const FAKE_PASSCODE = "123456";
export const ALPHA_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const PROJECTS = [
  {
    domain_id: "d1",
    enabled: true,
    id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    name: "Beta",
  },
  {
    domain_id: "d1",
    enabled: false,
    id: "cccccccccccccccccccccccccccccccc",
    name: "Gone",
  },
  { domain_id: "d1", enabled: true, id: ALPHA_ID, name: "Alpha" },
];

const DAY_MS = 86_400_000;

const flavor = (name: string) => ({
  disk: 0,
  id: `flavor-${name}`,
  name,
  ram: 4096,
  vcpus: 2,
});

const ip = (address: string) => ({ address });

/** Alpha's servers, newest first, the way the Space API lists them. */
export const FAKE_SERVERS = [
  {
    ageMs: 2 * 60_000,
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

const USERS = new Map([
  [FAKE_USER.name, { mfa: true, user: FAKE_USER }],
  [PLAIN_USER.name, { mfa: false, user: PLAIN_USER }],
]);

export interface FakeKeystone {
  url: string;
  requests: string[];
  stop: () => void;
}

const UserSchema = z.object({ name: z.string().optional() });

const AuthSchema = z.object({
  auth: z.object({
    identity: z.object({
      methods: z.array(z.string()),
      password: z
        .object({ user: UserSchema.extend({ password: z.string() }) })
        .optional(),
      token: z.object({ id: z.string() }).optional(),
      totp: z
        .object({ user: UserSchema.extend({ passcode: z.string() }) })
        .optional(),
    }),
    scope: z.object({ project: z.object({ id: z.string() }) }).optional(),
  }),
});

type Identity = z.infer<typeof AuthSchema>["auth"]["identity"];

const unauthorized = () =>
  Response.json(
    {
      error: {
        code: 401,
        message: "The request you have made requires authentication.",
      },
    },
    { status: 401 }
  );

const spaceFault = (status: number, message: string) =>
  Response.json({ message, status }, { status });

// The Space API takes a Keystone token and names the project in a header.
const listServers = (req: Request) => {
  const projectId = req.headers.get("Project-Id");
  if (!projectId) {
    return spaceFault(
      400,
      "The 'project-id' header is required to access this API."
    );
  }
  const servers = projectId === ALPHA_ID ? FAKE_SERVERS : [];
  return Response.json({
    instances: servers.map(({ ageMs, ...server }) => ({
      ...server,
      created: new Date(Date.now() - ageMs).toISOString(),
      tenant_id: projectId,
    })),
    page_control: { current_filter: {}, max_item: servers.length },
  });
};

const IssuedSchema = z.object({
  token: z.object({ project: z.object({ id: z.string() }).optional() }),
});

// Nipa's gateway drops the connection for a token without a catalog: one
// asked for with ?nocatalog, or an unscoped one. A dropped connection makes
// Bun print a stack trace, so the fake answers 502 instead.
const throughGateway = async (
  req: Request,
  res: Response
): Promise<Response> => {
  if (res.status === 401) {
    return new Response(null, { headers: res.headers, status: 401 });
  }
  if (res.status !== 201) {
    return res;
  }
  const { token } = IssuedSchema.parse(await res.clone().json());
  const noCatalog = new URL(req.url).searchParams.has("nocatalog");
  return noCatalog || !token.project
    ? new Response(null, { status: 502 })
    : res;
};

export const startFakeKeystone = ({ gateway = false } = {}): FakeKeystone => {
  const tokens = new Map<string, typeof FAKE_USER>();
  const receipts = new Map<string, typeof FAKE_USER>();
  const requests: string[] = [];

  const issue = (
    user: typeof FAKE_USER,
    projectId: string | undefined
  ): Response => {
    const project = PROJECTS.find((p) => p.id === projectId);
    if (projectId && !project) {
      return unauthorized();
    }
    const value = `tok-${randomUUID()}`;
    tokens.set(value, user);
    const token = {
      expires_at: new Date(Date.now() + 24 * 3_600_000).toISOString(),
      project: project && {
        domain: { id: project.domain_id },
        id: project.id,
        name: project.name,
      },
      user: { ...user, domain: { id: "d1", name: "nipacloud" } },
    };
    return Response.json(
      { token },
      { headers: { "X-Subject-Token": value }, status: 201 }
    );
  };

  const receiptFor = (user: typeof FAKE_USER): Response => {
    const receipt = `rcpt-${randomUUID()}`;
    receipts.set(receipt, user);
    return Response.json(
      {
        receipt: { methods: ["password"] },
        required_auth_methods: [["password", "totp"]],
      },
      { headers: { "Openstack-Auth-Receipt": receipt }, status: 401 }
    );
  };

  const verifyUser = (
    req: Request,
    identity: Identity,
    projectId?: string
  ): Response => {
    const receipt = req.headers.get("Openstack-Auth-Receipt");
    const fromReceipt = receipt ? receipts.get(receipt) : undefined;
    const name = identity.password?.user.name ?? identity.totp?.user.name ?? "";
    const account = USERS.get(name);
    const user = fromReceipt ?? account?.user;
    const passwordOk =
      fromReceipt !== undefined ||
      identity.password?.user.password === FAKE_PASSWORD;
    if (!(user && passwordOk)) {
      return unauthorized();
    }
    if (!account?.mfa) {
      return issue(user, projectId);
    }
    if (!identity.methods.includes("totp")) {
      return receiptFor(user);
    }
    return identity.totp?.user.passcode === FAKE_PASSCODE
      ? issue(user, projectId)
      : unauthorized();
  };

  const verify = (
    req: Request,
    identity: Identity,
    projectId?: string
  ): Response => {
    if (!identity.methods.includes("token")) {
      return verifyUser(req, identity, projectId);
    }
    const user = tokens.get(identity.token?.id ?? "");
    return user ? issue(user, projectId) : unauthorized();
  };

  const authTokens = async (req: Request): Promise<Response> => {
    if (req.method === "DELETE") {
      const subject = req.headers.get("X-Subject-Token") ?? "";
      return tokens.delete(subject)
        ? new Response(null, { status: 204 })
        : unauthorized();
    }
    const parsed = AuthSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(
        { error: { message: "bad request" } },
        { status: 400 }
      );
    }
    return verify(
      req,
      parsed.data.auth.identity,
      parsed.data.auth.scope?.project.id
    );
  };

  const space = (req: Request, pathname: string): Response => {
    if (!tokens.has(req.headers.get("X-Auth-Token") ?? "")) {
      return spaceFault(401, "The requested resource requires authorization.");
    }
    return pathname === "/api/v3/instances"
      ? listServers(req)
      : new Response("Not Found", { status: 404 });
  };

  const handle = (req: Request): Response | Promise<Response> => {
    const { pathname } = new URL(req.url);
    requests.push(`${req.method} ${pathname}`);
    if (pathname === "/v3" || pathname === "/v3/") {
      return Response.json({ version: { id: "v3.14", status: "stable" } });
    }
    if (pathname === "/v3/auth/tokens") {
      return authTokens(req);
    }
    if (pathname !== "/v3/auth/projects") {
      return new Response("not found", { status: 404 });
    }
    const token = req.headers.get("X-Auth-Token") ?? "";
    return tokens.has(token)
      ? Response.json({ projects: PROJECTS })
      : unauthorized();
  };

  const server = Bun.serve({
    fetch: async (req) => {
      const { pathname } = new URL(req.url);
      if (pathname.startsWith("/api/")) {
        requests.push(`${req.method} ${pathname}`);
        return space(req, pathname);
      }
      return gateway ? throughGateway(req, await handle(req)) : handle(req);
    },
    port: 0,
  });

  return {
    requests,
    stop: () => server.stop(true),
    url: `http://localhost:${server.port}`,
  };
};

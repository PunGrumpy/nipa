// me@example.com has the MFA rule password + totp. plain@example.com has no MFA.
// The catalog puts Nova on the same server, where Alpha has 3 servers on 2
// pages and the other projects have none.

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

export const FAKE_REGION = "NCP-TH";

const DAY_MS = 86_400_000;

const flavor = (name: string) => ({
  disk: 0,
  ephemeral: 0,
  extra_specs: {},
  original_name: name,
  ram: 4096,
  swap: 0,
  vcpus: 2,
});

const fixed = (addr: string, version = 4) => ({
  "OS-EXT-IPS-MAC:mac_addr": "fa:16:3e:00:00:01",
  "OS-EXT-IPS:type": "fixed",
  addr,
  version,
});

/** Alpha's servers, newest first, the way Nova lists them. */
export const FAKE_SERVERS = [
  {
    addresses: { "default-network": [fixed("192.0.2.7")] },
    ageMs: 2 * 60_000,
    flavor: flavor("csa.large.v2"),
    id: "33333333-3333-4333-8333-333333333333",
    name: "web-2",
    status: "BUILD",
  },
  {
    addresses: {
      "default-network": [
        fixed("192.0.2.5"),
        { ...fixed("203.0.113.10"), "OS-EXT-IPS:type": "floating" },
      ],
      v6: [fixed("2001:db8::5", 6)],
    },
    ageMs: 3 * DAY_MS,
    flavor: flavor("csa.large.v2"),
    id: "22222222-2222-4222-8222-222222222222",
    name: "web-1",
    status: "ACTIVE",
  },
  {
    addresses: { private: [fixed("198.51.100.4")] },
    ageMs: 40 * DAY_MS,
    flavor: flavor("csa.xlarge.v2"),
    id: "11111111-1111-4111-8111-111111111111",
    name: "db-1",
    status: "SHUTOFF",
  },
];

const PAGE_SIZE = 2;

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

const catalog = (origin: string) => ({
  catalog: [
    {
      endpoints: [
        {
          interface: "internal",
          region_id: FAKE_REGION,
          url: `${origin}/internal`,
        },
        { interface: "public", region_id: "OTHER", url: `${origin}/other` },
        {
          interface: "public",
          region_id: FAKE_REGION,
          url: `${origin}/compute/v2.1/`,
        },
      ],
      type: "compute",
    },
    {
      endpoints: [
        { interface: "public", region_id: FAKE_REGION, url: `${origin}/v3` },
      ],
      type: "identity",
    },
  ],
});

// Without microversion 2.47, Nova sends the flavor's ID instead of its name.
const toNova = (
  server: (typeof FAKE_SERVERS)[number],
  microversion: boolean
) => {
  const { ageMs, flavor: embedded, ...rest } = server;
  return {
    ...rest,
    created: new Date(Date.now() - ageMs).toISOString(),
    flavor: microversion ? embedded : { id: "f1", links: [] },
  };
};

const listServers = (req: Request, projectId: string | undefined) => {
  const url = new URL(req.url);
  const servers = projectId === ALPHA_ID ? FAKE_SERVERS : [];
  const marker = url.searchParams.get("marker");
  const start = marker ? servers.findIndex((s) => s.id === marker) + 1 : 0;
  const page = servers.slice(start, start + PAGE_SIZE);
  const last = page.at(-1);
  const more = last !== undefined && start + PAGE_SIZE < servers.length;
  const microversion =
    req.headers.get("OpenStack-API-Version") === "compute 2.47";
  return Response.json({
    servers: page.map((server) => toNova(server, microversion)),
    // Some clouds put an internal host in the next link.
    servers_links: more
      ? [
          {
            href: `http://nova.internal:8774/v2.1/servers/detail?marker=${last.id}`,
            rel: "next",
          },
        ]
      : undefined,
  });
};

export const startFakeKeystone = (): FakeKeystone => {
  const tokens = new Map<string, typeof FAKE_USER>();
  const scopes = new Map<string, string | undefined>();
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
    scopes.set(value, project?.id);
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

  const server = Bun.serve({
    fetch: (req) => {
      const { origin, pathname } = new URL(req.url);
      requests.push(`${req.method} ${pathname}`);
      if (pathname === "/v3" || pathname === "/v3/") {
        return Response.json({ version: { id: "v3.14", status: "stable" } });
      }
      if (pathname === "/v3/auth/tokens") {
        return authTokens(req);
      }
      const routes = new Map([
        [
          "/compute/v2.1/servers/detail",
          (t: string) => listServers(req, scopes.get(t)),
        ],
        ["/v3/auth/catalog", () => Response.json(catalog(origin))],
        ["/v3/auth/projects", () => Response.json({ projects: PROJECTS })],
      ]);
      const route = routes.get(pathname);
      if (!route) {
        return new Response("not found", { status: 404 });
      }
      const token = req.headers.get("X-Auth-Token") ?? "";
      return tokens.has(token) ? route(token) : unauthorized();
    },
    port: 0,
  });

  return {
    requests,
    stop: () => server.stop(true),
    url: `http://localhost:${server.port}`,
  };
};

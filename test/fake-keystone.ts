// A tiny Keystone that enforces password + TOTP, for tests.

import { randomUUID } from "node:crypto";

import { z } from "zod";

export const FAKE_USER = { id: "u1", name: "me@example.com" };
export const FAKE_PASSWORD = "secret";
export const FAKE_PASSCODE = "123456";

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
  {
    domain_id: "d1",
    enabled: true,
    id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    name: "Alpha",
  },
];

export interface FakeKeystone {
  url: string;
  stop: () => void;
}

const AuthSchema = z.object({
  auth: z.object({
    identity: z.object({
      methods: z.array(z.string()),
      password: z
        .object({ user: z.object({ password: z.string() }) })
        .optional(),
      token: z.object({ id: z.string() }).optional(),
      totp: z.object({ user: z.object({ passcode: z.string() }) }).optional(),
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

/** What Keystone returns when the credentials are right but the MFA rules are not met. */
const authReceipt = () =>
  Response.json(
    {
      receipt: { methods: ["password"] },
      required_auth_methods: [["password", "totp"]],
    },
    { status: 401 }
  );

const tokenBody = (projectId: string | undefined) => {
  const project = PROJECTS.find((p) => p.id === projectId);
  return {
    token: {
      expires_at: new Date(Date.now() + 24 * 3_600_000).toISOString(),
      methods: ["password", "totp"],
      project: project && {
        domain: { id: project.domain_id },
        id: project.id,
        name: project.name,
      },
      user: { ...FAKE_USER, domain: { id: "d1", name: "nipacloud" } },
    },
  };
};

export const startFakeKeystone = (): FakeKeystone => {
  const tokens = new Set<string>();

  const issue = (projectId: string | undefined): Response => {
    if (projectId && !PROJECTS.some((p) => p.id === projectId)) {
      return Response.json(
        { error: { message: "project not found" } },
        { status: 401 }
      );
    }
    const value = `tok-${randomUUID()}`;
    tokens.add(value);
    return Response.json(tokenBody(projectId), {
      headers: { "X-Subject-Token": value },
      status: 201,
    });
  };

  const verify = (
    identity: Identity,
    projectId: string | undefined
  ): Response => {
    if (identity.methods.includes("token")) {
      return tokens.has(identity.token?.id ?? "")
        ? issue(projectId)
        : unauthorized();
    }
    if (identity.password?.user.password !== FAKE_PASSWORD) {
      return unauthorized();
    }
    if (!identity.methods.includes("totp")) {
      return authReceipt();
    }
    return identity.totp?.user.passcode === FAKE_PASSCODE
      ? issue(projectId)
      : unauthorized();
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
      parsed.data.auth.identity,
      parsed.data.auth.scope?.project.id
    );
  };

  const server = Bun.serve({
    fetch: (req) => {
      const { pathname } = new URL(req.url);
      if (pathname === "/v3/auth/tokens") {
        return authTokens(req);
      }
      if (pathname === "/v3/auth/projects") {
        return tokens.has(req.headers.get("X-Auth-Token") ?? "")
          ? Response.json({ projects: PROJECTS })
          : unauthorized();
      }
      return new Response("not found", { status: 404 });
    },
    port: 0,
  });

  return {
    stop: () => server.stop(true),
    url: `http://localhost:${server.port}`,
  };
};

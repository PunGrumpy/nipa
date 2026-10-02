// Keystone v3 client with the calls nipa needs to turn a password and OTP code
// into a project-scoped token, switch projects and revoke the token.

import { z } from "zod";

export const ProjectSchema = z.object({
  domainId: z.string().optional(),
  id: z.string(),
  name: z.string(),
});

export type Project = z.infer<typeof ProjectSchema>;

export interface Token {
  value: string;
  expiresAt: string;
  user: { id: string; name: string };
  project?: Project;
}

export class KeystoneError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "KeystoneError";
    this.status = status;
  }
}

/** Accepts `https://host`, `https://host/` or `https://host/v3/` and returns `https://host/v3`. */
export const identityUrl = (authUrl: string): string => {
  let base = authUrl;
  while (base.endsWith("/")) {
    base = base.slice(0, -1);
  }
  if (base.endsWith("/v3")) {
    base = base.slice(0, -"/v3".length);
  }
  return `${base}/v3`;
};

export interface PasswordTotpInput {
  username: string;
  userDomain: string;
  password: string;
  passcode: string;
  projectId?: string;
}

interface UserRef {
  name: string;
  domain: { name: string };
}

interface AuthRequest {
  auth: {
    identity:
      | {
          methods: ["password", "totp"];
          password: { user: UserRef & { password: string } };
          totp: { user: UserRef & { passcode: string } };
        }
      | { methods: ["token"]; token: { id: string } };
    scope?: { project: { id: string } };
  };
}

/**
 * Password and TOTP in one request. Keystone checks both against the user's
 * MFA rules; without a project the token is unscoped.
 */
export const passwordTotpBody = (input: PasswordTotpInput): AuthRequest => {
  const user: UserRef = {
    domain: { name: input.userDomain },
    name: input.username,
  };
  const request: AuthRequest = {
    auth: {
      identity: {
        methods: ["password", "totp"],
        password: { user: { ...user, password: input.password } },
        totp: { user: { ...user, passcode: input.passcode } },
      },
    },
  };
  if (input.projectId) {
    request.auth.scope = { project: { id: input.projectId } };
  }
  return request;
};

/** Exchanges an existing token for one scoped to another project. */
export const rescopeBody = (token: string, projectId: string): AuthRequest => ({
  auth: {
    identity: { methods: ["token"], token: { id: token } },
    scope: { project: { id: projectId } },
  },
});

const ErrorSchema = z.object({
  error: z.object({ message: z.string().optional() }).optional(),
  // An auth receipt: the credentials were right but did not satisfy the MFA rules.
  receipt: z.object({}).loose().optional(),
  required_auth_methods: z.array(z.array(z.string())).optional(),
});

type KeystoneErrorBody = z.infer<typeof ErrorSchema>;

/** Turns a failed response into a sentence a user can act on. */
export const errorMessage = (
  status: number,
  body: KeystoneErrorBody
): string => {
  if (body.receipt) {
    const rules = (body.required_auth_methods ?? []).map((rule) =>
      rule.join(" + ")
    );
    return rules.length > 0
      ? `this account needs ${rules.join(" or ")} to log in`
      : "this account's MFA rules do not allow this login method";
  }
  if (status === 401) {
    return "invalid username, password or OTP code";
  }
  return body.error?.message ?? `Keystone returned HTTP ${status}`;
};

const fail = async (res: Response): Promise<never> => {
  const text = await res.text();
  let body: KeystoneErrorBody = {};
  try {
    const parsed = ErrorSchema.safeParse(JSON.parse(text));
    if (parsed.success) {
      body = parsed.data;
    }
  } catch {
    // not JSON, e.g. an HTML page from a proxy
  }
  throw new KeystoneError(errorMessage(res.status, body), res.status);
};

const TokenSchema = z.object({
  token: z.object({
    expires_at: z.string(),
    project: z
      .object({
        domain: z.object({ id: z.string() }).optional(),
        id: z.string(),
        name: z.string(),
      })
      .optional(),
    user: z.object({ id: z.string(), name: z.string() }),
  }),
});

export const toToken = (
  value: string,
  body: z.infer<typeof TokenSchema>
): Token => {
  const { expires_at: expiresAt, project, user } = body.token;
  return {
    expiresAt,
    project: project && {
      domainId: project.domain?.id,
      id: project.id,
      name: project.name,
    },
    user,
    value,
  };
};

const issue = async (authUrl: string, request: AuthRequest): Promise<Token> => {
  const res = await fetch(`${identityUrl(authUrl)}/auth/tokens?nocatalog`, {
    body: JSON.stringify(request),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    return fail(res);
  }
  const value = res.headers.get("X-Subject-Token");
  if (!value) {
    throw new KeystoneError("Keystone did not return a token", res.status);
  }
  const parsed = TokenSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new KeystoneError(
      `unexpected token response: ${z.prettifyError(parsed.error)}`,
      res.status
    );
  }
  return toToken(value, parsed.data);
};

export const loginWithPasswordTotp = (
  authUrl: string,
  input: PasswordTotpInput
): Promise<Token> => issue(authUrl, passwordTotpBody(input));

export const rescope = (
  authUrl: string,
  token: string,
  projectId: string
): Promise<Token> => issue(authUrl, rescopeBody(token, projectId));

const ProjectsSchema = z.object({
  projects: z.array(
    z.object({
      domain_id: z.string().optional(),
      enabled: z.boolean().optional(),
      id: z.string(),
      name: z.string(),
    })
  ),
});

export const toProjects = (body: z.infer<typeof ProjectsSchema>): Project[] =>
  body.projects
    .filter((p) => p.enabled !== false)
    .map((p) => ({ domainId: p.domain_id, id: p.id, name: p.name }))
    .toSorted((a, b) => a.name.localeCompare(b.name));

/** Projects the token's user can scope to, sorted by name. */
export const listProjects = async (
  authUrl: string,
  token: string
): Promise<Project[]> => {
  const res = await fetch(`${identityUrl(authUrl)}/auth/projects`, {
    headers: { "X-Auth-Token": token },
  });
  if (!res.ok) {
    return fail(res);
  }
  const parsed = ProjectsSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new KeystoneError(
      `unexpected project list: ${z.prettifyError(parsed.error)}`,
      res.status
    );
  }
  return toProjects(parsed.data);
};

export const revoke = async (authUrl: string, token: string): Promise<void> => {
  const res = await fetch(`${identityUrl(authUrl)}/auth/tokens`, {
    headers: { "X-Auth-Token": token, "X-Subject-Token": token },
    method: "DELETE",
  });
  // The token authenticates its own revocation, so 401 and 404 both mean it is
  // already expired or revoked, which is what we wanted anyway.
  if (!(res.ok || res.status === 401 || res.status === 404)) {
    await fail(res);
  }
};

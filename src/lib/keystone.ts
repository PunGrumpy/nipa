// Keystone v3 client. Login sends the password first; when the account's MFA
// rules want more, Keystone answers with an auth receipt and nipa sends the
// OTP code with that receipt. Tokens can then switch projects or be revoked.

import { z } from "zod";

import { request } from "./http";

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

/** Who is logging in, and where. Without a project ID the token is unscoped. */
export interface Account {
  authUrl: string;
  username: string;
  userDomain: string;
  projectId?: string;
}

interface UserRef {
  name: string;
  domain: { name: string };
}

type Identity =
  | {
      methods: ["password"];
      password: { user: UserRef & { password: string } };
    }
  | { methods: ["totp"]; totp: { user: UserRef & { passcode: string } } }
  | { methods: ["token"]; token: { id: string } };

interface AuthRequest {
  auth: { identity: Identity; scope?: { project: { id: string } } };
}

const authRequest = (identity: Identity, projectId?: string): AuthRequest =>
  projectId
    ? { auth: { identity, scope: { project: { id: projectId } } } }
    : { auth: { identity } };

const userRef = (account: Account): UserRef => ({
  domain: { name: account.userDomain },
  name: account.username,
});

export const passwordBody = (account: Account, password: string): AuthRequest =>
  authRequest(
    {
      methods: ["password"],
      password: { user: { ...userRef(account), password } },
    },
    account.projectId
  );

export const totpBody = (account: Account, passcode: string): AuthRequest =>
  authRequest(
    { methods: ["totp"], totp: { user: { ...userRef(account), passcode } } },
    account.projectId
  );

/** Exchanges an existing token for one scoped to another project. */
export const rescopeBody = (token: string, projectId: string): AuthRequest =>
  authRequest({ methods: ["token"], token: { id: token } }, projectId);

const ErrorSchema = z.object({
  error: z.object({ message: z.string().optional() }).optional(),
  // An auth receipt: the credentials so far were right, but the MFA rules need more.
  receipt: z.object({}).loose().optional(),
  required_auth_methods: z.array(z.array(z.string())).optional(),
});

type ErrorBody = z.infer<typeof ErrorSchema>;

const readError = async (res: Response): Promise<ErrorBody> => {
  try {
    const parsed = ErrorSchema.safeParse(JSON.parse(await res.text()));
    return parsed.success ? parsed.data : {};
  } catch {
    // not JSON, for example an HTML page from a proxy
    return {};
  }
};

/** Turns a failed response into a sentence a user can act on. */
export const errorMessage = (input: {
  status: number;
  body: ErrorBody;
  unauthorized: string;
}): string => {
  const { body, status } = input;
  if (body.receipt) {
    const rules = (body.required_auth_methods ?? []).map((rule) =>
      rule.join(" + ")
    );
    return rules.length > 0
      ? `this account needs ${rules.join(" or ")} to log in`
      : "this account's MFA rules don't allow this login method";
  }
  if (status === 401) {
    return input.unauthorized;
  }
  return body.error?.message ?? `Keystone returned HTTP ${status}`;
};

const fail = async (res: Response, unauthorized: string): Promise<never> => {
  const body = await readError(res);
  throw new KeystoneError(
    errorMessage({ body, status: res.status, unauthorized }),
    res.status
  );
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

const toToken = (value: string, body: z.infer<typeof TokenSchema>): Token => {
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

const RECEIPT_HEADER = "Openstack-Auth-Receipt";

const postToken = (
  authUrl: string,
  body: AuthRequest,
  receipt?: string
): Promise<Response> => {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (receipt !== undefined) {
    headers.set(RECEIPT_HEADER, receipt);
  }
  return request(`${identityUrl(authUrl)}/auth/tokens?nocatalog`, {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  });
};

const readToken = async (res: Response): Promise<Token> => {
  const value = res.headers.get("X-Subject-Token");
  if (!value) {
    throw new KeystoneError("Keystone didn't return a token", res.status);
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

type PasswordResult =
  | { kind: "token"; token: Token }
  | { kind: "mfa"; receipt: string };

/**
 * Sends the password. Accounts without MFA get a token. Accounts whose MFA
 * rules include TOTP get a receipt to send with the OTP code.
 */
export const loginWithPassword = async (
  account: Account,
  password: string
): Promise<PasswordResult> => {
  const res = await postToken(account.authUrl, passwordBody(account, password));
  if (res.ok) {
    return { kind: "token", token: await readToken(res) };
  }
  const receipt = res.headers.get(RECEIPT_HEADER);
  if (res.status === 401 && receipt) {
    const body = await readError(res);
    const wantsTotp = (body.required_auth_methods ?? []).some((rule) =>
      rule.includes("totp")
    );
    if (wantsTotp) {
      return { kind: "mfa", receipt };
    }
    throw new KeystoneError(
      errorMessage({ body, status: res.status, unauthorized: "" }),
      res.status
    );
  }
  return fail(res, "wrong email or password");
};

/** Sends the OTP code with the receipt from {@link loginWithPassword}. */
export const continueWithTotp = async (input: {
  account: Account;
  receipt: string;
  passcode: string;
}): Promise<Token> => {
  const { account, passcode, receipt } = input;
  const res = await postToken(
    account.authUrl,
    totpBody(account, passcode),
    receipt
  );
  return res.ok ? readToken(res) : fail(res, "wrong OTP code");
};

/** A token and the Keystone that issued it, for calls made with that token. */
interface TokenRequest {
  authUrl: string;
  token: string;
}

const SESSION_GONE = "the session expired or was revoked";

export const rescope = async (
  input: TokenRequest & { projectId: string }
): Promise<Token> => {
  const res = await postToken(
    input.authUrl,
    rescopeBody(input.token, input.projectId)
  );
  return res.ok ? readToken(res) : fail(res, SESSION_GONE);
};

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

const toProjects = (body: z.infer<typeof ProjectsSchema>): Project[] =>
  body.projects
    .filter((p) => p.enabled !== false)
    .map((p) => ({ domainId: p.domain_id, id: p.id, name: p.name }))
    .toSorted((a, b) => a.name.localeCompare(b.name));

/** Projects the token's user can scope to, sorted by name. */
export const listProjects = async ({
  authUrl,
  token,
}: TokenRequest): Promise<Project[]> => {
  const res = await request(`${identityUrl(authUrl)}/auth/projects`, {
    headers: { "X-Auth-Token": token },
  });
  if (!res.ok) {
    return fail(res, SESSION_GONE);
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

export const revoke = async ({
  authUrl,
  token,
}: TokenRequest): Promise<void> => {
  const res = await request(`${identityUrl(authUrl)}/auth/tokens`, {
    headers: { "X-Auth-Token": token, "X-Subject-Token": token },
    method: "DELETE",
  });
  // The token authenticates its own revocation, so 401 and 404 both mean it
  // already expired or was revoked, which is the outcome logout wants.
  if (!(res.ok || res.status === 401 || res.status === 404)) {
    await fail(res, SESSION_GONE);
  }
};

const VersionSchema = z.object({
  version: z.object({ id: z.string(), status: z.string() }),
});

/** Checks that a URL is a Keystone v3 endpoint and returns its version, such as `v3.14`. */
export const probe = async (authUrl: string): Promise<string> => {
  const url = identityUrl(authUrl);
  const res = await request(url, { signal: AbortSignal.timeout(10_000) });
  let parsed: ReturnType<typeof VersionSchema.safeParse>;
  try {
    parsed = VersionSchema.safeParse(await res.json());
  } catch {
    // not JSON, so not Keystone
    parsed = VersionSchema.safeParse(null);
  }
  if (!(res.ok && parsed.success)) {
    throw new KeystoneError(
      `${url} doesn't answer like Keystone v3 (HTTP ${res.status})`,
      res.status
    );
  }
  return parsed.data.version.id;
};

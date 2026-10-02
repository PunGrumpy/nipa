import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  errorMessage,
  identityUrl,
  KeystoneError,
  listProjects,
  loginWithPasswordTotp,
  passwordTotpBody,
  rescope,
  rescopeBody,
  revoke,
} from "../src/lib/keystone";
import { startFakeKeystone } from "./fake-keystone";
import type { FakeKeystone } from "./fake-keystone";

describe("identityUrl", () => {
  test.each([
    ["https://id.example", "https://id.example/v3"],
    ["https://id.example/", "https://id.example/v3"],
    ["https://id.example/v3", "https://id.example/v3"],
    ["https://id.example/v3/", "https://id.example/v3"],
    ["https://h/identity", "https://h/identity/v3"],
  ])("%s -> %s", (input, expected) => {
    expect(identityUrl(input)).toBe(expected);
  });
});

describe("request bodies", () => {
  const input = {
    passcode: "123456",
    password: "pw",
    userDomain: "nipacloud",
    username: "me@example.com",
  };

  test("password + totp, unscoped without a project", () => {
    const body = passwordTotpBody(input);
    expect(body.auth.identity.methods).toEqual(["password", "totp"]);
    expect(body.auth.scope).toBeUndefined();
    expect(body).toMatchObject({
      auth: {
        identity: {
          password: {
            user: {
              domain: { name: "nipacloud" },
              name: "me@example.com",
              password: "pw",
            },
          },
          totp: { user: { name: "me@example.com", passcode: "123456" } },
        },
      },
    });
  });

  test("password + totp, scoped to a project", () => {
    expect(passwordTotpBody({ ...input, projectId: "p1" }).auth.scope).toEqual({
      project: { id: "p1" },
    });
  });

  test("rescope uses the token method", () => {
    expect(rescopeBody("tok", "p2")).toEqual({
      auth: {
        identity: { methods: ["token"], token: { id: "tok" } },
        scope: { project: { id: "p2" } },
      },
    });
  });
});

describe("errorMessage", () => {
  test("auth receipt with required methods", () => {
    const body = { receipt: {}, required_auth_methods: [["password", "totp"]] };
    expect(errorMessage(401, body)).toBe(
      "this account needs password + totp to log in"
    );
  });

  test("auth receipt with empty rules (application credential under MFA)", () => {
    expect(errorMessage(401, { receipt: {}, required_auth_methods: [] })).toBe(
      "this account's MFA rules do not allow this login method"
    );
  });

  test("plain 401", () => {
    expect(errorMessage(401, {})).toBe(
      "invalid username, password or OTP code"
    );
  });

  test("other errors use Keystone's message", () => {
    expect(errorMessage(403, { error: { message: "nope" } })).toBe("nope");
    expect(errorMessage(500, {})).toBe("Keystone returned HTTP 500");
  });
});

describe("against a fake Keystone", () => {
  let keystone: FakeKeystone;

  beforeAll(() => {
    keystone = startFakeKeystone();
  });

  afterAll(() => {
    keystone.stop();
  });

  const credentials = {
    passcode: "123456",
    password: "secret",
    userDomain: "nipacloud",
    username: "me@example.com",
  };

  test("logs in scoped to a project", async () => {
    const token = await loginWithPasswordTotp(keystone.url, {
      ...credentials,
      projectId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(token.value).toStartWith("tok-");
    expect(token.user).toEqual({ id: "u1", name: "me@example.com" });
    expect(token.project).toEqual({
      domainId: "d1",
      id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      name: "Alpha",
    });
  });

  test("wrong OTP code is a 401 with a readable message", async () => {
    const attempt = loginWithPasswordTotp(keystone.url, {
      ...credentials,
      passcode: "000000",
    });
    await expect(attempt).rejects.toThrow(KeystoneError);
    await expect(attempt).rejects.toThrow(
      "invalid username, password or OTP code"
    );
  });

  test("password alone gets an auth receipt", async () => {
    const res = await fetch(`${keystone.url}/v3/auth/tokens`, {
      body: JSON.stringify({
        auth: {
          identity: {
            methods: ["password"],
            password: { user: { name: "me@example.com", password: "secret" } },
          },
        },
      }),
      method: "POST",
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      required_auth_methods: [["password", "totp"]],
    });
  });

  test("lists enabled projects sorted by name, then rescopes", async () => {
    const unscoped = await loginWithPasswordTotp(keystone.url, credentials);
    expect(unscoped.project).toBeUndefined();
    const projects = await listProjects(keystone.url, unscoped.value);
    expect(projects.map((p) => p.name)).toEqual(["Alpha", "Beta"]);
    const beta = projects.find((p) => p.name === "Beta");
    const scoped = await rescope(keystone.url, unscoped.value, beta?.id ?? "");
    expect(scoped.project?.name).toBe("Beta");
  });

  test("revoked tokens stop working", async () => {
    const token = await loginWithPasswordTotp(keystone.url, credentials);
    await revoke(keystone.url, token.value);
    await expect(listProjects(keystone.url, token.value)).rejects.toThrow(
      KeystoneError
    );
    // revoking twice is fine
    await expect(revoke(keystone.url, token.value)).resolves.toBeUndefined();
  });
});

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { z } from "zod";

import { ApiError, createService } from "../src/util/api";
import { listServers } from "../src/util/compute";
import { loginWithPassword } from "../src/util/keystone";
import {
  ALPHA_ID,
  FAKE_PASSWORD,
  FAKE_SERVERS,
  PLAIN_USER,
  startFakeKeystone,
} from "./fake-keystone";
import type { FakeKeystone } from "./fake-keystone";

const FAULTS = new Map<string, () => Response>([
  [
    "/nova",
    () =>
      Response.json(
        { itemNotFound: { code: 404, message: "Instance x not found." } },
        { status: 404 }
      ),
  ],
  [
    "/neutron",
    () =>
      Response.json(
        { NeutronError: { detail: "", message: "Quota exceeded", type: "Q" } },
        { status: 409 }
      ),
  ],
  ["/html", () => new Response("<h1>Bad Gateway</h1>", { status: 502 })],
  ["/not-json", () => new Response("ok")],
]);

describe("createService", () => {
  let server: ReturnType<typeof Bun.serve>;
  const service = () =>
    createService({ token: "tok", type: "compute", url: `${server.url}` });

  beforeAll(() => {
    server = Bun.serve({
      fetch: (req) =>
        FAULTS.get(new URL(req.url).pathname)?.() ??
        Response.json({ token: req.headers.get("X-Auth-Token") }),
      port: 0,
    });
  });

  afterAll(() => {
    server.stop(true);
  });

  test("sends the token and parses the body", async () => {
    const body = await service().get("/echo", z.object({ token: z.string() }));
    expect(body.token).toBe("tok");
  });

  test.each([
    ["/nova", "Instance x not found.", 404],
    ["/neutron", "Quota exceeded", 409],
    ["/html", "compute returned HTTP 502", 502],
  ])("%s: the fault's message and status", async (path, message, status) => {
    const attempt = service().get(path, z.object({}));
    await expect(attempt).rejects.toThrow(ApiError);
    await expect(attempt).rejects.toThrow(message);
    await expect(attempt).rejects.toMatchObject({ status });
  });

  test("a body that isn't the expected JSON", async () => {
    const attempt = service().get("/not-json", z.object({ id: z.string() }));
    await expect(attempt).rejects.toThrow("unexpected compute response");
  });
});

describe("listServers", () => {
  let keystone: FakeKeystone;

  beforeAll(() => {
    keystone = startFakeKeystone();
  });

  afterAll(() => {
    keystone.stop();
  });

  test("reads every page, by marker, with flavor names", async () => {
    const login = await loginWithPassword(
      {
        authUrl: keystone.url,
        projectId: ALPHA_ID,
        userDomain: "nipacloud",
        username: PLAIN_USER.name,
      },
      FAKE_PASSWORD
    );
    if (login.kind !== "token") {
      throw new Error("expected a token");
    }
    const compute = createService({
      token: login.token.value,
      type: "compute",
      url: `${keystone.url}/compute/v2.1/`,
    });
    const servers = await listServers(compute);
    expect(servers.map((s) => s.name)).toEqual(FAKE_SERVERS.map((s) => s.name));
    expect(servers[1]).toMatchObject({
      flavor: "csa.large.v2",
      status: "ACTIVE",
    });
    expect(servers[1]?.addresses).toContainEqual({
      address: "203.0.113.10",
      network: "default-network",
      type: "floating",
      version: 4,
    });
    const pages = keystone.requests.filter((r) => r.includes("/servers/"));
    expect(pages).toHaveLength(2);
  });
});

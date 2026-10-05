import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { z } from "zod";

import { ApiError, createSpace, spaceApiUrl } from "../../../src/util/api";
import { listServers } from "../../../src/util/compute";
import { CliError } from "../../../src/util/ui";
import { alphaSpace } from "../../helpers";
import { startFakeKeystone } from "../../mocks/keystone";
import type { FakeKeystone } from "../../mocks/keystone";
import { FAKE_SERVERS } from "../../mocks/space";

const FAULTS = new Map<string, () => Response>([
  [
    "/fault",
    () =>
      Response.json(
        { message: "Instance x not found.", status: 404 },
        { status: 404 }
      ),
  ],
  ["/html", () => new Response("<h1>Bad Gateway</h1>", { status: 502 })],
  [
    "/web-page",
    () =>
      new Response("<!DOCTYPE html>", {
        headers: { "Content-Type": "text/html" },
      }),
  ],
  ["/wrong-json", () => Response.json({ name: 1 })],
]);

const HeadersSchema = z.object({
  projectId: z.string(),
  region: z.string(),
  token: z.string(),
});

describe("spaceApiUrl", () => {
  test.each([
    ["https://space.nipa.cloud", "https://space.nipa.cloud/api"],
    [
      "https://portal-stg-epc.nipa.cloud/",
      "https://portal-stg-epc.nipa.cloud/api",
    ],
    ["https://space.nipa.cloud/api", "https://space.nipa.cloud/api"],
    ["https://space.nipa.cloud/api/", "https://space.nipa.cloud/api"],
  ])("%s -> %s", (url, api) => {
    expect(spaceApiUrl(url)).toBe(api);
  });
});

describe("createSpace", () => {
  let server: ReturnType<typeof Bun.serve>;
  const space = () =>
    createSpace({
      projectId: "p1",
      region: "NCP-TH",
      token: "tok",
      url: `${server.url}api/`,
    });

  beforeAll(() => {
    server = Bun.serve({
      fetch: (req) =>
        FAULTS.get(new URL(req.url).pathname.replace("/api", ""))?.() ??
        Response.json({
          projectId: req.headers.get("Project-Id"),
          region: req.headers.get("Region"),
          token: req.headers.get("X-Auth-Token"),
        }),
      port: 0,
    });
  });

  afterAll(() => {
    server.stop(true);
  });

  test("sends the token, project and region, and parses the body", async () => {
    expect(await space().get("/echo", HeadersSchema)).toEqual({
      projectId: "p1",
      region: "NCP-TH",
      token: "tok",
    });
  });

  test.each([
    ["/fault", "Instance x not found.", 404],
    ["/html", "the Space API returned HTTP 502", 502],
  ])("%s: the fault's message and status", async (path, message, status) => {
    const attempt = space().get(path, z.object({}));
    await expect(attempt).rejects.toThrow(ApiError);
    await expect(attempt).rejects.toThrow(message);
    await expect(attempt).rejects.toMatchObject({ status });
  });

  test("a web page, such as a portal's for a path it doesn't know", async () => {
    const attempt = space().get("/web-page", z.object({}));
    await expect(attempt).rejects.toThrow(CliError);
    await expect(attempt).rejects.toThrow(
      `${server.url}api doesn't answer like the Space API`
    );
  });

  test("JSON that isn't the expected shape", async () => {
    const attempt = space().get("/wrong-json", z.object({ id: z.string() }));
    await expect(attempt).rejects.toThrow("unexpected Space API response");
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

  test("reads the project's servers with flavor names and addresses", async () => {
    const space = await alphaSpace(keystone.url);
    const servers = await listServers(space);
    expect(servers.map((s) => s.name)).toEqual(FAKE_SERVERS.map((s) => s.name));
    expect(servers[1]).toMatchObject({
      flavor: "csa.large.v2",
      status: "ACTIVE",
    });
    expect(servers[1]?.addresses).toEqual([
      { address: "192.0.2.5", type: "fixed", version: 4 },
      { address: "2001:db8::5", type: "fixed", version: 6 },
      { address: "203.0.113.10", type: "floating", version: 4 },
    ]);
  });
});

// Runs `nipa mcp` as a process against the fake Keystone, and talks to it the
// way an AI assistant does: JSON-RPC lines on stdin and stdout.

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { z } from "zod";

import { TOOLS } from "../src/util/mcp-tools";
import { ENTRY, runProcess, seedSession, testEnv } from "./helpers";
import { startMcp } from "./mcp-client";
import type { Json, Params } from "./mcp-client";
import { startFakeKeystone } from "./mocks/keystone";
import type { FakeKeystone } from "./mocks/keystone";
import { FAKE_VOLUMES } from "./mocks/space";

let keystone: FakeKeystone;
let dir: string;

const env = () => testEnv(dir);

// The fake Space API dates a resource from the moment of the request, so two
// reads of one resource differ by a few milliseconds.
const TIMESTAMP = /\d{4}-\d\d-\d\dT[\d:.]+Z/gu;

const withoutTimes = (document: Json): Json =>
  JSON.parse(JSON.stringify(document).replaceAll(TIMESTAMP, "<time>"));

/** What `nipa ... --json` prints. */
const cli = async (args: readonly string[]) => {
  const { code, stdout } = await runProcess(["bun", ENTRY, ...args], env());
  expect(code).toBe(0);
  return z.record(z.string(), z.json()).parse(withoutTimes(JSON.parse(stdout)));
};

beforeAll(() => {
  keystone = startFakeKeystone({ gateway: true });
});

afterAll(() => {
  keystone.stop();
});

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "nipa-mcp-"));
  await seedSession(dir, keystone.url);
});

const expire = async () => {
  const file = path.join(dir, "auth.json");
  const auth = JSON.parse(await readFile(file, "utf-8"));
  for (const session of Object.values<{ expiresAt: string }>(auth.sessions)) {
    session.expiresAt = new Date(Date.now() - 60_000).toISOString();
  }
  await writeFile(file, JSON.stringify(auth));
};

const savedFiles = async () => [
  await readFile(path.join(dir, "config.json"), "utf-8"),
  await readFile(path.join(dir, "auth.json"), "utf-8"),
];

afterAll(async () => {
  await rm(dir, { force: true, recursive: true });
});

describe("nipa mcp", () => {
  test("initializes, lists the read-only tools and keeps stdout to protocol frames", async () => {
    const mcp = startMcp({ env: env() });
    const server = await mcp.initialize();
    expect(server.serverInfo.name).toBe("nipa");
    const tools = await mcp.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(
      TOOLS.map((tool) => tool.name)
    );
    for (const tool of tools) {
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.description.length).toBeGreaterThan(0);
    }
    const who = await mcp.call("whoami");
    expect(who.isError).toBe(false);
    const { code, stderr } = await mcp.finish();
    expect(code).toBe(0);
    expect(mcp.stdoutLines).toHaveLength(3);
    for (const line of mcp.stdoutLines) {
      expect(JSON.parse(line)).toMatchObject({ jsonrpc: "2.0" });
    }
    // Messages go to stderr, and nothing asks the person anything.
    expect(stderr).toContain("Serving 18 read-only tools for the prod profile");
    expect(stderr).not.toContain("available");
    expect(stderr).not.toContain("Password");
  });

  test("every tool answers with the document --json prints", async () => {
    const mcp = startMcp({ env: env() });
    await mcp.initialize();
    const pairs: [string, Params, string[]][] = [
      ["whoami", {}, ["whoami"]],
      ["list_servers", {}, ["server", "ls"]],
      ["inspect_server", { server: "web-1" }, ["server", "inspect", "web-1"]],
      ["server_history", { server: "web-1" }, ["server", "history", "web-1"]],
      [
        "server_console_log",
        { server: "web-1", tail: 3 },
        ["server", "logs", "web-1", "--tail", "3"],
      ],
      ["search_servers", { query: "web" }, ["server", "search", "web"]],
      ["list_volumes", {}, ["volume", "ls"]],
      ["list_networks", {}, ["network", "ls"]],
      ["list_security_groups", {}, ["sg", "ls"]],
      ["inspect_security_group", { group: "web" }, ["sg", "inspect", "web"]],
      ["list_load_balancers", {}, ["lb", "ls"]],
      ["list_databases", {}, ["db", "ls"]],
      ["inspect_database", { database: "orders" }, ["db", "inspect", "orders"]],
      ["list_kubernetes_clusters", {}, ["k8s", "ls"]],
      ["list_quotas", {}, ["quota", "ls"]],
      ["list_flavors", {}, ["flavor", "ls"]],
      [
        "investigate",
        { name: "k8s-worker-1" },
        ["investigate", "k8s-worker-1"],
      ],
    ];
    await Promise.all(
      pairs.map(async ([tool, input, argv]) => {
        const answer = await mcp.call(tool, input);
        expect(answer.isError, tool).toBe(false);
        expect(withoutTimes(answer.document), tool).toEqual(
          await cli([...argv, "--json"])
        );
      })
    );
    await mcp.finish();
  });

  test("inspect_load_balancer adds the diagnosis to what lb inspect prints", async () => {
    const mcp = startMcp({ env: env() });
    await mcp.initialize();
    const answer = await mcp.call("inspect_load_balancer", {
      loadBalancer: "web-lb",
    });
    const printed = await cli(["lb", "inspect", "web-lb", "--json"]);
    expect(answer.isError).toBe(false);
    expect(withoutTimes(answer.document)).toMatchObject({
      ...printed,
      diagnosis: {
        details: [
          "Backup member web-3 is offline until the other members go down",
        ],
        healthy: false,
        verdict: expect.stringContaining("1 of 3 members is down"),
      },
    });
    await mcp.finish();
  });

  test("investigate finds what is wrong with a broken server, as investigate --json prints it", async () => {
    const mcp = startMcp({ env: env() });
    await mcp.initialize();
    const answer = await mcp.call("investigate", { name: "k8s-worker-1" });
    expect(answer.isError).toBe(false);
    expect(withoutTimes(answer.document)).toEqual(
      await cli(["investigate", "k8s-worker-1", "--json"])
    );
    expect(answer.document).toMatchObject({
      investigation: { kind: "server", name: "k8s-worker-1" },
      profile: "prod",
      project: { name: "Alpha" },
    });
    expect(answer.document).toMatchObject({
      investigation: {
        findings: expect.arrayContaining([
          expect.objectContaining({
            check: "status",
            evidence: ["status: ERROR"],
            severity: "problem",
          }),
        ]),
      },
    });
    await mcp.finish();
  });

  test("investigate on a name of two kinds is the ambiguous_name error, and kind picks one", async () => {
    FAKE_VOLUMES.push({
      ageMs: 60_000,
      attachments: [],
      availability_zone: "NCP-BKK",
      bootable: "false",
      id: "vvvv8888-0000-4000-8000-000000000008",
      name: "web-1",
      size: 20,
      status: "available",
      volume_type: "Standard_SSD",
    });
    const mcp = startMcp({ env: env() });
    try {
      await mcp.initialize();
      const answer = await mcp.call("investigate", { name: "web-1" });
      expect(answer.isError).toBe(true);
      expect(answer.document).toMatchObject({
        data: { ids: expect.any(Array) },
        hint: expect.stringContaining("nipa investigate web-1 --kind volume"),
        reason: "ambiguous_name",
        status: "action_required",
      });
      const picked = await mcp.call("investigate", {
        kind: "volume",
        name: "web-1",
      });
      expect(picked.isError).toBe(false);
      expect(withoutTimes(picked.document)).toEqual(
        await cli(["investigate", "web-1", "--kind", "volume", "--json"])
      );
      const wrong = await mcp.call("investigate", {
        kind: "network",
        name: "web-1",
      });
      expect(wrong.isError).toBe(true);
      expect(wrong.document).toMatchObject({ reason: "invalid_arguments" });
    } finally {
      FAKE_VOLUMES.pop();
      await mcp.finish();
    }
  });

  test("a tool's project reads another project and saves nothing", async () => {
    const before = await savedFiles();
    const mcp = startMcp({ env: env() });
    await mcp.initialize();
    const answer = await mcp.call("list_servers", { project: "Beta" });
    expect(answer.isError).toBe(false);
    expect(withoutTimes(answer.document)).toEqual(
      await cli(["-p", "Beta", "server", "ls", "--json"])
    );
    expect(answer.document).toMatchObject({ project: { name: "Beta" } });
    await mcp.finish();
    expect(await savedFiles()).toEqual(before);
  });

  test("-p picks the project for the whole run, and -P the profile", async () => {
    const before = await savedFiles();
    const mcp = startMcp({ args: ["-p", "Beta"], env: env() });
    await mcp.initialize();
    const answer = await mcp.call("list_servers");
    expect(answer.document).toMatchObject({
      profile: "prod",
      project: { name: "Beta" },
    });
    await mcp.finish();
    expect(await savedFiles()).toEqual(before);

    const named = startMcp({ args: ["-P", "nope"], env: env() });
    const { code, stderr } = await named.finish();
    expect(code).toBe(1);
    expect(stderr).toContain('no profile named "nope"');
    expect(named.stdoutLines).toEqual([]);
  });

  test("a failed lookup is an error result with the message and next commands", async () => {
    const mcp = startMcp({ env: env() });
    await mcp.initialize();
    const answer = await mcp.call("inspect_server", { server: "nope" });
    expect(answer.isError).toBe(true);
    expect(answer.document).toMatchObject({
      message: expect.stringContaining('no server named or with ID "nope"'),
      next: [{ command: "nipa server ls" }],
      reason: "not_found",
    });
    const wrong = await mcp.call("inspect_server", {});
    expect(wrong.isError).toBe(true);
    expect(wrong.document).toMatchObject({ reason: "invalid_arguments" });
    const unknown = await mcp.call("server_stop", { server: "web-1" });
    expect(unknown.isError).toBe(true);
    expect(unknown.document).toMatchObject({ reason: "invalid_arguments" });
    expect(
      keystone.requests.some((r) => r.startsWith("POST /api/v4/instances/"))
    ).toBe(false);
    await mcp.finish();
  });

  test("an expired session is an error that asks for nipa login, and nothing prompts", async () => {
    await expire();
    const mcp = startMcp({ env: env() });
    await mcp.initialize();
    const calls: [string, Params][] = [
      ["list_servers", {}],
      ["search_servers", { query: "web" }],
      ["whoami", {}],
    ];
    await Promise.all(
      calls.map(async ([tool, input]) => {
        const answer = await mcp.call(tool, input);
        expect(answer.isError, tool).toBe(true);
        expect(answer.document, tool).toMatchObject({
          hint: expect.stringContaining("run `nipa login` in a terminal"),
          next: [{ command: "nipa login" }],
          reason: "token_expired",
          status: "action_required",
        });
      })
    );
    // The server keeps answering after the failures, and its stdout is still only frames.
    const pong = await mcp.request("ping");
    expect(pong.error).toBeUndefined();
    const { code, stderr } = await mcp.finish();
    expect(code).toBe(0);
    expect(stderr).not.toContain("Password");
    expect(mcp.stdoutLines).toHaveLength(5);
    for (const line of mcp.stdoutLines) {
      expect(JSON.parse(line)).toMatchObject({ jsonrpc: "2.0" });
    }
  });

  test("a session that was never started says to log in", async () => {
    await rm(path.join(dir, "auth.json"));
    const mcp = startMcp({ env: env() });
    await mcp.initialize();
    const answer = await mcp.call("list_volumes");
    expect(answer.isError).toBe(true);
    expect(answer.document).toMatchObject({ reason: "login_required" });
    await mcp.finish();
  });

  test("a login in another terminal is picked up without a restart", async () => {
    await expire();
    const expired = await readFile(path.join(dir, "auth.json"), "utf-8");
    const mcp = startMcp({ env: env() });
    await mcp.initialize();
    const before = await mcp.call("list_volumes");
    expect(before.isError).toBe(true);
    await seedSession(dir, keystone.url);
    const after = await mcp.call("list_volumes");
    expect(after.isError).toBe(false);
    await mcp.finish();
    const renewed = await readFile(path.join(dir, "auth.json"), "utf-8");
    expect(renewed).not.toBe(expired);
  });
});

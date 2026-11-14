// The npm package is the Node bundle of src/index.ts. These tests build it the
// way `bun run build:npm` does, then run it with node.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import pkg from "../package.json" with { type: "json" };
import {
  ENTRY,
  runProcess,
  runWithClosedStderr,
  runWithClosedStdout,
  seedSession,
  testEnv,
} from "./helpers";
import { startMcp } from "./mcp-client";
import { startFakeKeystone } from "./mocks/keystone";
import type { FakeKeystone } from "./mocks/keystone";
import { FAKE_SERVERS } from "./mocks/space";

let dir: string;
let bundle: string;
let keystone: FakeKeystone;

const node = (...args: string[]) =>
  runProcess(["node", bundle, ...args], testEnv(dir));

describe.if(Bun.which("node") !== null)("the npm bundle on Node", () => {
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "nipa-npm-"));
    bundle = path.join(dir, "nipa.js");
    const build = await runProcess(
      ["bun", "build", ENTRY, "--target=node", "--minify", "--outfile", bundle],
      testEnv(dir)
    );
    expect(build.code).toBe(0);
    keystone = startFakeKeystone();
    await seedSession(dir, keystone.url);
  });

  afterAll(async () => {
    keystone.stop();
    await rm(dir, { force: true, recursive: true });
  });

  test("starts with a node shebang", async () => {
    const text = await readFile(bundle, "utf-8");
    const [firstLine] = text.split("\n");
    expect(firstLine).toBe("#!/usr/bin/env node");
  });

  test("prints the version", async () => {
    const { code, stdout } = await node("--version");
    expect(code).toBe(0);
    expect(stdout.trim()).toBe(pkg.version);
  });

  test("a closed stdout is not an error", async () => {
    const { code, stderr } = await runWithClosedStdout(
      ["node", bundle, "profile", "ls", "--json"],
      testEnv(dir)
    );
    expect(stderr).toBe("");
    expect(code).toBe(0);
  });

  test("a closed stderr keeps the exit code of the error", async () => {
    const { code } = await runWithClosedStderr(
      ["node", bundle, "logn"],
      testEnv(dir)
    );
    expect(code).toBe(2);
  });

  test("serves MCP tools on stdout, and stops when stdin ends", async () => {
    const mcp = startMcp({ command: ["node", bundle], env: testEnv(dir) });
    const server = await mcp.initialize();
    expect(server.serverInfo.name).toBe("nipa");
    const tools = await mcp.listTools();
    expect(tools.map((tool) => tool.name)).toContain("list_servers");
    const answer = await mcp.call("list_servers");
    expect(answer.isError).toBe(false);
    expect(answer.document).toMatchObject({
      servers: expect.arrayContaining([
        expect.objectContaining({ name: "web-1" }),
      ]),
    });
    const { code } = await mcp.finish();
    expect(code).toBe(0);
    for (const line of mcp.stdoutLines) {
      expect(JSON.parse(line)).toMatchObject({ jsonrpc: "2.0" });
    }
  });

  test("lists servers through the Space API", async () => {
    const { code, stdout } = await node("server", "ls", "--json");
    expect(code).toBe(0);
    expect(JSON.parse(stdout).servers).toHaveLength(FAKE_SERVERS.length);
  });

  test("exec returns the program's exit code", async () => {
    const { code } = await node("exec", "sh", "-c", "exit 7");
    expect(code).toBe(7);
  });

  // With a bun shebang in src/index.ts, the bundle held 2 copies of CliError
  // and this crashed instead of exiting 127.
  test("exec reports a missing program with exit code 127", async () => {
    const { code, stderr } = await node("exec", "no-such-tool-xyz");
    expect(code).toBe(127);
    expect(stderr).toContain("command not found: no-such-tool-xyz");
  });
});

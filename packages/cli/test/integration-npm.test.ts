// The npm package is the Node bundle of src/bin.ts. These tests build it the
// way `bun run build:npm` does, then run it with node.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import pkg from "../package.json" with { type: "json" };
import {
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

const BUILD = path.join(import.meta.dir, "..", "scripts", "build-npm.ts");
const CACHE_FOLDER = "node-compile-cache";

let dir: string;
let bundle: string;
let temp: string;
let keystone: FakeKeystone;

// Node keeps its compile cache in the OS temp folder, which TMPDIR moves
// here so a test run leaves nothing in the real one.
const node = (...args: string[]) =>
  runProcess(["node", bundle, ...args], { ...testEnv(dir), TMPDIR: temp });

const cacheFiles = async (root: string): Promise<string[]> => {
  try {
    return await readdir(path.join(root, CACHE_FOLDER), { recursive: true });
  } catch {
    return [];
  }
};

describe.if(Bun.which("node") !== null)("the npm bundle on Node", () => {
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "nipa-npm-"));
    temp = await mkdtemp(path.join(tmpdir(), "nipa-npm-tmp-"));
    bundle = path.join(dir, "nipa.js");
    const build = await runProcess(["bun", BUILD, dir], testEnv(dir));
    expect(build.code).toBe(0);
    keystone = startFakeKeystone();
    await seedSession(dir, keystone.url);
  });

  afterAll(async () => {
    keystone.stop();
    await rm(dir, { force: true, recursive: true });
    await rm(temp, { force: true, recursive: true });
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

  test("caches compiled code in the temp folder, not the config directory", async () => {
    await node("--version");
    const cached = await cacheFiles(temp);
    expect(cached.length).toBeGreaterThan(0);
    expect(await cacheFiles(dir)).toEqual([]);
  });

  test("NODE_DISABLE_COMPILE_CACHE keeps the cache off", async () => {
    const off = await mkdtemp(path.join(tmpdir(), "nipa-npm-off-"));
    try {
      const { code, stdout } = await runProcess(["node", bundle, "--version"], {
        ...testEnv(dir),
        NODE_DISABLE_COMPILE_CACHE: "1",
        TMPDIR: off,
      });
      expect(code).toBe(0);
      expect(stdout.trim()).toBe(pkg.version);
      expect(await cacheFiles(off)).toEqual([]);
    } finally {
      await rm(off, { force: true, recursive: true });
    }
  });

  test("a temp folder that can't be written is not an error", async () => {
    const { code, stdout } = await runProcess(["node", bundle, "--version"], {
      ...testEnv(dir),
      TMPDIR: bundle,
    });
    expect(code).toBe(0);
    expect(stdout.trim()).toBe(pkg.version);
  });

  test("a closed stdout is not an error", async () => {
    const { code, stderr } = await runWithClosedStdout(
      ["node", bundle, "profile", "ls", "--json"],
      { ...testEnv(dir), TMPDIR: temp }
    );
    expect(stderr).toBe("");
    expect(code).toBe(0);
  });

  test("a closed stderr keeps the exit code of the error", async () => {
    const { code } = await runWithClosedStderr(["node", bundle, "logn"], {
      ...testEnv(dir),
      TMPDIR: temp,
    });
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

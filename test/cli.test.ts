// End-to-end: run the CLI as a process against a temp config dir.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import pkg from "../package.json" with { type: "json" };
import { FAKE_USER, startFakeKeystone } from "./fake-keystone";
import type { FakeKeystone } from "./fake-keystone";
import { ENTRY, runProcess, seedSession, testEnv } from "./helpers";

let dir: string;
let keystone: FakeKeystone;

const run = (args: string[], extraEnv: Record<string, string> = {}) =>
  runProcess(["bun", ENTRY, ...args], { ...testEnv(dir), ...extraEnv });

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "nipa-test-"));
  keystone = startFakeKeystone();
});

afterAll(async () => {
  keystone.stop();
  await rm(dir, { force: true, recursive: true });
});

describe("without a session", () => {
  test("--help lists the commands", async () => {
    const { code, stdout } = await run(["--help"]);
    expect(code).toBe(0);
    for (const name of [
      "login",
      "logout",
      "whoami",
      "switch",
      "os",
      "tf",
      "exec",
      "env",
    ]) {
      expect(stdout).toContain(name);
    }
  });

  test("--version", async () => {
    const { stdout } = await run(["--version"]);
    expect(stdout.trim()).toBe(pkg.version);
  });

  test("unknown command exits 2", async () => {
    const { code, stderr } = await run(["deploy"]);
    expect(code).toBe(2);
    expect(stderr).toContain('unknown command "deploy"');
  });

  test("unknown option exits 2", async () => {
    const { code } = await run(["whoami", "--nope"]);
    expect(code).toBe(2);
  });

  test("logout without a session is a no-op", async () => {
    const { code, stderr } = await run(["logout"]);
    expect(code).toBe(0);
    expect(stderr).toContain("Not currently logged in");
  });

  test("whoami says how to log in", async () => {
    const { code, stderr } = await run(["whoami"]);
    expect(code).toBe(1);
    expect(stderr).toContain("nipa login");
  });

  test("exec without a terminal does not prompt", async () => {
    const { code, stderr } = await run(["exec", "true"]);
    expect(code).toBe(1);
    expect(stderr).toContain("not logged in");
  });

  test("login without a terminal fails fast", async () => {
    const { code, stderr } = await run(["login"]);
    expect(code).toBe(1);
    expect(stderr).toContain("needs a terminal");
  });
});

describe("with a session", () => {
  beforeAll(() => seedSession(dir, keystone.url));

  test("whoami prints the user on stdout and details on stderr", async () => {
    const { code, stderr, stdout } = await run(["whoami"]);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe(FAKE_USER.name);
    expect(stderr).toContain("Alpha");
  });

  test("whoami --json", async () => {
    const { stdout } = await run(["whoami", "--json"]);
    expect(JSON.parse(stdout)).toMatchObject({
      project: { name: "Alpha" },
      user: FAKE_USER,
    });
  });

  test("env --shell fish", async () => {
    const { stdout } = await run(["env", "--shell", "fish"]);
    expect(stdout).toContain("set -gx OS_PROJECT_NAME 'Alpha'");
    expect(stdout).toContain("set -gx OS_AUTH_TYPE 'v3token'");
  });

  test("exec passes the session and drops stale OS_*", async () => {
    const { code, stdout } = await run(["exec", "env"], {
      OS_PASSWORD: "stale",
    });
    expect(code).toBe(0);
    expect(stdout).toContain("OS_PROJECT_ID=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(stdout).not.toContain("OS_PASSWORD");
  });

  test("exec returns the child's exit code", async () => {
    const { code } = await run(["exec", "sh", "-c", "exit 7"]);
    expect(code).toBe(7);
  });

  test("exec reports a missing command", async () => {
    const { code, stderr } = await run(["exec", "no-such-tool-xyz"]);
    expect(code).toBe(127);
    expect(stderr).toContain("command not found");
  });

  test("switch by name rescopes without a password", async () => {
    const { code, stderr } = await run(["switch", "Beta"]);
    expect(code).toBe(0);
    expect(stderr).toContain("Switched to Beta");
    const saved = JSON.parse(
      await readFile(path.join(dir, "auth.json"), "utf-8")
    );
    expect(saved.project.name).toBe("Beta");
  });

  test("files are private", async () => {
    const info = await stat(path.join(dir, "auth.json"));
    // last three octal digits are the permission bits
    expect(info.mode.toString(8).slice(-3)).toBe("600");
  });

  test("logout revokes and deletes the session", async () => {
    const { code } = await run(["logout"]);
    expect(code).toBe(0);
    const after = await run(["whoami"]);
    expect(after.code).toBe(1);
  });
});

describe("broken files", () => {
  test("an invalid session file gives a clear error", async () => {
    await writeFile(path.join(dir, "auth.json"), '{"token": 1}');
    const { code, stderr } = await run(["whoami"]);
    expect(code).toBe(1);
    expect(stderr).toContain("auth.json");
    expect(stderr).toContain("delete it");
  });
});

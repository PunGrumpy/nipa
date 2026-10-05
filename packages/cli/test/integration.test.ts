import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import pkg from "../package.json" with { type: "json" };
import {
  ENTRY,
  runProcess,
  seedLegacySession,
  seedSession,
  testEnv,
} from "./helpers";
import { FAKE_USER, startFakeKeystone } from "./mocks/keystone";
import type { FakeKeystone } from "./mocks/keystone";
import {
  FAKE_DATABASES,
  FAKE_IPS,
  FAKE_LOAD_BALANCERS,
  FAKE_SERVERS,
} from "./mocks/space";

let dir: string;
let keystone: FakeKeystone;

const run = (args: string[], extraEnv: Record<string, string> = {}) =>
  runProcess(["bun", ENTRY, ...args], { ...testEnv(dir), ...extraEnv });

const exitCode = async (args: string[]): Promise<number> => {
  const { code } = await run(args);
  return code;
};

const readJsonFile = async (name: string) =>
  JSON.parse(await readFile(path.join(dir, name), "utf-8"));

const serverLists = () =>
  keystone.requests.filter((r) => r === "GET /api/v3/instances").length;

const freshDir = async () => {
  await rm(dir, { force: true, recursive: true });
  dir = await mkdtemp(path.join(tmpdir(), "nipa-test-"));
};

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "nipa-test-"));
  keystone = startFakeKeystone({ gateway: true });
});

afterAll(async () => {
  keystone.stop();
  await rm(dir, { force: true, recursive: true });
});

describe("help and usage", () => {
  test("--help groups the commands and lists the global options", async () => {
    const { code, stdout } = await run(["--help"]);
    expect(code).toBe(0);
    for (const text of [
      "Session:",
      "Resources:",
      "Run tools:",
      "Setup:",
      "Global options:",
      "--profile <name>",
      "profile",
    ]) {
      expect(stdout).toContain(text);
    }
    expect(stdout).not.toContain("__complete");
  });

  test("help for one command, as `help <command>` or `<command> --help`", async () => {
    const a = await run(["help", "login"]);
    const b = await run(["login", "--help"]);
    expect(a.stdout).toContain("Usage: nipa login [options]");
    expect(a.stdout).toContain("--username <email>");
    expect(b.stdout).toBe(a.stdout);
  });

  test("--version", async () => {
    const { stdout } = await run(["--version"]);
    expect(stdout.trim()).toBe(pkg.version);
  });

  test("a mistyped command suggests the closest one", async () => {
    const { code, stderr } = await run(["logn"]);
    expect(code).toBe(2);
    expect(stderr).toContain('unknown command "logn"');
    expect(stderr).toContain("Did you mean `nipa login`?");
  });

  test("bad options exit 2", async () => {
    expect(await exitCode(["--nope"])).toBe(2);
    expect(await exitCode(["whoami", "--nope"])).toBe(2);
    expect(await exitCode(["-P"])).toBe(2);
  });
});

describe("without a session", () => {
  beforeEach(freshDir);

  test("whoami says how to log in", async () => {
    const { code, stderr } = await run(["whoami"]);
    expect(code).toBe(1);
    expect(stderr).toContain("aren't logged in to prod");
    expect(stderr).toContain("nipa login");
  });

  test("whoami --json reports loggedIn false", async () => {
    const { stdout } = await run(["whoami", "--json"]);
    expect(JSON.parse(stdout)).toEqual({ loggedIn: false, profile: "prod" });
  });

  test("exec doesn't prompt without a terminal", async () => {
    const { code, stderr } = await run(["exec", "true"]);
    expect(code).toBe(1);
    expect(stderr).toContain("aren't logged in");
  });

  test("login fails fast without a terminal", async () => {
    const { code, stderr } = await run(["login"]);
    expect(code).toBe(1);
    expect(stderr).toContain("needs a terminal");
  });

  test("logout is a no-op", async () => {
    const { code, stderr } = await run(["logout"]);
    expect(code).toBe(0);
    expect(stderr).toContain("Not logged in to prod");
  });

  test("an unknown profile names the known ones", async () => {
    const { code, stderr } = await run(["-P", "nope", "whoami"]);
    expect(code).toBe(1);
    expect(stderr).toContain('no profile named "nope"');
    expect(stderr).toContain("nipa profile add nope");
  });
});

describe("profiles", () => {
  beforeAll(freshDir);

  test("prod is there from the start and is current", async () => {
    const { stderr } = await run(["profile", "ls"]);
    expect(stderr).toContain("1 profile");
    expect(stderr).toMatch(/✔ prod\s+identity-api\.nipa\.cloud\s+NCP-TH/u);
  });

  test("add checks that the URL is Keystone v3", async () => {
    const { code, stderr } = await run([
      "profile",
      "add",
      "staging",
      "--auth-url",
      keystone.url,
    ]);
    expect(code).toBe(0);
    expect(stderr).toContain("Added profile staging (Keystone v3.14)");
    expect(stderr).toContain("nipa login -P staging");
  });

  test("add refuses a duplicate name, a bad name and a URL that isn't Keystone", async () => {
    expect(
      await exitCode(["profile", "add", "staging", "--auth-url", keystone.url])
    ).toBe(2);
    expect(
      await exitCode(["profile", "add", "Bad_Name", "--auth-url", keystone.url])
    ).toBe(2);
    const notKeystone = await run([
      "profile",
      "add",
      "other",
      "--auth-url",
      `${keystone.url}/nope`,
    ]);
    expect(notKeystone.code).toBe(1);
    expect(notKeystone.stderr).toContain("doesn't answer like Keystone v3");
  });

  test("add keeps --space-url, or production's Space API without it", async () => {
    expect(
      await exitCode([
        "profile",
        "add",
        "dev",
        "--auth-url",
        keystone.url,
        "--space-url",
        "https://space.example.com/api",
      ])
    ).toBe(0);
    const config = await readJsonFile("config.json");
    expect(config.profiles.dev.spaceUrl).toBe("https://space.example.com/api");
    expect(config.profiles.staging.spaceUrl).toBe(
      "https://space.nipa.cloud/api"
    );
    await run(["profile", "rm", "dev", "--yes"]);
  });

  test("add refuses a --space-url that isn't a URL", async () => {
    const { code, stderr } = await run([
      "profile",
      "add",
      "other",
      "--auth-url",
      keystone.url,
      "--space-url",
      "space",
    ]);
    expect(code).toBe(2);
    expect(stderr).toContain('invalid --space-url "space"');
  });

  test("add without a terminal needs --auth-url", async () => {
    const { code, stderr } = await run(["profile", "add", "dev"]);
    expect(code).toBe(2);
    expect(stderr).toContain("missing --auth-url");
  });

  test("use switches the current profile", async () => {
    const { stderr } = await run(["profile", "use", "staging"]);
    expect(stderr).toContain("Now using profile staging");
    const ls = await run(["profile", "ls", "--json"]);
    const current = JSON.parse(ls.stdout).find(
      (p: { current: boolean }) => p.current
    );
    expect(current.name).toBe("staging");
  });

  test("NIPA_PROFILE and -P override the current profile", async () => {
    const env = await run(["whoami", "--json"], { NIPA_PROFILE: "prod" });
    expect(JSON.parse(env.stdout).profile).toBe("prod");
    const flag = await run(["whoami", "--json", "-P", "prod"]);
    expect(JSON.parse(flag.stdout).profile).toBe("prod");
  });

  test("rm refuses prod, and needs --yes without a terminal", async () => {
    expect(await exitCode(["profile", "rm", "prod", "--yes"])).toBe(1);
    expect(await exitCode(["profile", "rm", "staging"])).toBe(2);
  });

  test("rm --yes removes the profile and goes back to prod", async () => {
    const { code, stderr } = await run(["profile", "rm", "staging", "--yes"]);
    expect(code).toBe(0);
    expect(stderr).toContain("Removed profile staging");
    expect(stderr).toContain("Now using prod");
    const config = await readJsonFile("config.json");
    expect(config.currentProfile).toBe("prod");
  });
});

describe("with a session", () => {
  beforeAll(async () => {
    await freshDir();
    await seedSession(dir, keystone.url);
  });

  test("whoami in a pipe prints only the user", async () => {
    const { code, stdout } = await run(["whoami"]);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe(FAKE_USER.name);
  });

  test("whoami --json", async () => {
    const { stdout } = await run(["whoami", "--json"]);
    expect(JSON.parse(stdout)).toMatchObject({
      loggedIn: true,
      profile: "prod",
      project: { name: "Alpha" },
      user: FAKE_USER,
    });
  });

  test("global options work before and after the command", async () => {
    const before = await run(["-P", "prod", "whoami"]);
    const after = await run(["whoami", "--profile=prod"]);
    expect(before.stdout).toBe(after.stdout);
  });

  test("words after -- go to the command, not to nipa", async () => {
    const { code, stderr } = await run(["switch", "--", "--help"]);
    expect(code).toBe(1);
    expect(stderr).toContain('no project named or with ID "--help"');
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

  test("--help after exec goes to the command, not to nipa", async () => {
    // sh's builtin echo, because GNU echo answers --help itself
    const { stdout } = await run([
      "exec",
      "sh",
      "-c",
      'echo "$1"',
      "sh",
      "--help",
    ]);
    expect(stdout.trim()).toBe("--help");
  });

  test("exec returns the command's exit code", async () => {
    const { code } = await run(["exec", "sh", "-c", "exit 7"]);
    expect(code).toBe(7);
  });

  test("exec reports a missing command", async () => {
    const { code, stderr } = await run(["exec", "no-such-tool-xyz"]);
    expect(code).toBe(127);
    expect(stderr).toContain("command not found");
  });

  test("switch by name needs no password and shows how long it took", async () => {
    const { code, stderr } = await run(["switch", "Beta"]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/Success! Switched to Beta \[\d+(?:ms|s)\]/u);
    const auth = await readJsonFile("auth.json");
    expect(auth.sessions.prod.project.name).toBe("Beta");
  });

  test("switch without a project and without a terminal lists the projects", async () => {
    const { code, stderr } = await run(["switch"]);
    expect(code).toBe(2);
    expect(stderr).toContain("Alpha, Beta");
  });

  test("files are private", async () => {
    const info = await stat(path.join(dir, "auth.json"));
    expect(info.mode.toString(8).slice(-3)).toBe("600");
  });

  test("--debug logs each request without tokens", async () => {
    const { stderr } = await run(["--debug", "switch", "Alpha"]);
    expect(stderr).toContain("[debug]");
    expect(stderr).toMatch(
      /201 POST http:\/\/localhost:\d+\/v3\/auth\/tokens/u
    );
    expect(stderr).not.toContain("tok-");
  });

  test("logout revokes and deletes the session", async () => {
    const { code, stderr } = await run(["logout"]);
    expect(code).toBe(0);
    expect(stderr).toContain("Logged out of prod");
    const after = await run(["whoami"]);
    expect(after.code).toBe(1);
  });
});

describe("server ls", () => {
  beforeAll(async () => {
    await freshDir();
    await seedSession(dir, keystone.url);
  });

  test("--json lists the project's servers through the Space API", async () => {
    const before = serverLists();
    const { code, stdout } = await run(["server", "ls", "--json"]);
    expect(code).toBe(0);
    const { profile, project, servers } = JSON.parse(stdout);
    expect(profile).toBe("prod");
    expect(project.name).toBe("Alpha");
    expect(servers.map((s: { id: string }) => s.id)).toEqual(
      FAKE_SERVERS.map((s) => s.id)
    );
    expect(servers[1]).toMatchObject({
      addresses: [
        { address: "192.0.2.5", type: "fixed", version: 4 },
        { address: "2001:db8::5", type: "fixed", version: 6 },
        { address: "203.0.113.10", type: "floating", version: 4 },
      ],
      flavor: "csa.large.v2",
      name: "web-1",
      status: "ACTIVE",
    });
    expect(serverLists()).toBe(before + 1);
  });

  test("a session from before the Space API loses its catalog endpoints", async () => {
    const auth = await readJsonFile("auth.json");
    auth.sessions.prod.endpoints = {
      compute: "https://cloud-api.nipa.cloud:8774/v2.1",
    };
    await writeFile(path.join(dir, "auth.json"), JSON.stringify(auth));
    expect(await exitCode(["server", "ls", "--json"])).toBe(0);
    // A switch saves the session again.
    await run(["switch", "Beta"]);
    await run(["switch", "Alpha"]);
    const saved = await readJsonFile("auth.json");
    expect(saved.sessions.prod.endpoints).toBeUndefined();
  });

  test("prints a table on stderr and one ID per line to a pipe", async () => {
    const { code, stderr, stdout } = await run(["servers", "list"]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/> Servers in Alpha \[\d+(?:ms|s)\]/u);
    expect(stderr).toMatch(/Name\s+Status\s+Address\s+Flavor\s+Age/u);
    expect(stderr).toMatch(
      /web-1\s+● Active\s+203\.0\.113\.10\s+csa\.large\.v2\s+3d/u
    );
    expect(stdout.trim().split("\n")).toEqual(FAKE_SERVERS.map((s) => s.id));
  });

  test("a project without servers says so after a switch", async () => {
    await run(["switch", "Beta"]);
    const { code, stderr, stdout } = await run(["server", "ls"]);
    expect(code).toBe(0);
    expect(stderr).toContain("No servers in Beta");
    expect(stdout).toBe("");
  });

  test("a revoked token asks for a new login", async () => {
    const auth = await readJsonFile("auth.json");
    const { token } = auth.sessions.prod;
    await fetch(`${keystone.url}/v3/auth/tokens`, {
      headers: { "X-Auth-Token": token, "X-Subject-Token": token },
      method: "DELETE",
    });
    const { code, stderr } = await run(["server", "ls"]);
    expect(code).toBe(1);
    expect(stderr).toContain("your prod session expired or was revoked");
    expect(stderr).toContain("Run `nipa login`.");
  });

  test("an unreachable Space API names its host, not the Keystone URL", async () => {
    await freshDir();
    await seedSession(dir, keystone.url);
    const config = await readJsonFile("config.json");
    // Nothing listens on port 1, so the connection fails at once.
    config.profiles.prod.spaceUrl = "http://127.0.0.1:1/api";
    await writeFile(path.join(dir, "config.json"), JSON.stringify(config));
    const { code, stderr } = await run(["server", "ls"]);
    expect(code).toBe(1);
    expect(stderr).toContain("can't reach 127.0.0.1:1");
    expect(stderr).toContain(
      "Check your network connection, or the profile's Space API URL."
    );
    expect(stderr).not.toContain("Check the Keystone URL");
    expect(stderr).not.toContain("catalog");
  });

  test("an unknown subcommand exits 2", async () => {
    const { code, stderr } = await run(["server", "nope"]);
    expect(code).toBe(2);
    expect(stderr).toContain('unknown subcommand "server nope"');
  });
});

describe("db ls", () => {
  beforeAll(async () => {
    await freshDir();
    await seedSession(dir, keystone.url);
  });

  test("--json lists the project's databases, newest first", async () => {
    const { code, stdout } = await run(["db", "ls", "--json"]);
    expect(code).toBe(0);
    const { databases, profile, project } = JSON.parse(stdout);
    expect(profile).toBe("prod");
    expect(project.name).toBe("Alpha");
    expect(databases.map((d: { name: string }) => d.name)).toEqual([
      "cache",
      "analytics",
      "orders",
    ]);
    expect(databases[2]).toMatchObject({
      id: FAKE_DATABASES[0]?.id,
      primary: { engine: "mysql", externalAddress: "203.0.113.20" },
    });
  });

  test("prints a table on stderr and one ID per line to a pipe", async () => {
    const { code, stderr, stdout } = await run(["databases"]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/> Databases in Alpha \[\d+(?:ms|s)\]/u);
    expect(stderr).toMatch(/Name\s+Engine\s+Status\s+Address\s+Flavor\s+Age/u);
    expect(stderr).toMatch(
      /orders\s+mysql 8\.0\.34\s+● Active\s+203\.0\.113\.20\s+dsa\.large\.v1\s+30d/u
    );
    expect(stderr).toMatch(
      /analytics\s+postgresql 17\.10\s+● Build\s+192\.0\.2\.21/u
    );
    expect(stderr).toMatch(/cache\s+-\s+-\s+-\s+-\s+1m/u);
    expect(stdout.trim().split("\n")).toHaveLength(FAKE_DATABASES.length);
  });

  test("a project without databases says so", async () => {
    await run(["switch", "Beta"]);
    const { code, stderr, stdout } = await run(["db", "ls"]);
    expect(code).toBe(0);
    expect(stderr).toContain("No databases in Beta");
    expect(stdout).toBe("");
  });
});

describe("lb ls", () => {
  beforeAll(async () => {
    await freshDir();
    await seedSession(dir, keystone.url);
  });

  test("--json lists the project's load balancers, newest first", async () => {
    const { code, stdout } = await run(["lb", "ls", "--json"]);
    expect(code).toBe(0);
    const { loadBalancers, project } = JSON.parse(stdout);
    expect(project.name).toBe("Alpha");
    expect(loadBalancers.map((lb: { id: string }) => lb.id)).toEqual(
      FAKE_LOAD_BALANCERS.map((lb) => lb.id).toReversed()
    );
    expect(loadBalancers[0]).toMatchObject({
      health: "OFFLINE",
      listeners: 0,
      status: "PENDING_CREATE",
    });
  });

  test("prints a table on stderr and one ID per line to a pipe", async () => {
    const { code, stderr, stdout } = await run(["loadbalancers"]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/> Load balancers in Alpha \[\d+(?:ms|s)\]/u);
    expect(stderr).toMatch(
      /Name\s+Status\s+Health\s+Address\s+Listeners\s+Age/u
    );
    expect(stderr).toMatch(
      /web-lb\s+● Active\s+● Online\s+192\.0\.2\.30\s+2\s+7d/u
    );
    expect(stderr).toMatch(/api-lb\s+● Pending create\s+● Offline/u);
    expect(stdout.trim().split("\n")).toHaveLength(FAKE_LOAD_BALANCERS.length);
  });

  test("a project without load balancers says so", async () => {
    await run(["switch", "Beta"]);
    const { code, stderr, stdout } = await run(["lb", "ls"]);
    expect(code).toBe(0);
    expect(stderr).toContain("No load balancers in Beta");
    expect(stdout).toBe("");
  });
});

describe("ip ls", () => {
  beforeAll(async () => {
    await freshDir();
    await seedSession(dir, keystone.url);
  });

  test("--json lists the project's external IPs", async () => {
    const { code, stdout } = await run(["ip", "ls", "--json"]);
    expect(code).toBe(0);
    const { ips, project } = JSON.parse(stdout);
    expect(project.name).toBe("Alpha");
    expect(ips).toHaveLength(FAKE_IPS.length);
    expect(ips[0]).toMatchObject({
      address: "203.0.113.10",
      internalAddress: "192.0.2.5",
      status: "ACTIVE",
    });
  });

  test("prints a table on stderr and one address per line to a pipe", async () => {
    const { code, stderr, stdout } = await run(["ips"]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/> External IPs in Alpha \[\d+(?:ms|s)\]/u);
    expect(stderr).toMatch(/Address\s+Status\s+Internal IP\s+Zone\s+Name/u);
    expect(stderr).toMatch(
      /203\.0\.113\.20\s+● Active\s+192\.0\.2\.20\s+NCP-BKK\s+orders's Public IP/u
    );
    expect(stderr).toMatch(/203\.0\.113\.99\s+● Down\s+-\s+NCP-NON\s+spare/u);
    expect(stdout.trim().split("\n")).toEqual(
      FAKE_IPS.map((ip) => ip.external_ip_address)
    );
  });

  test("a project without external IPs says so", async () => {
    await run(["switch", "Beta"]);
    const { code, stderr, stdout } = await run(["ip", "ls"]);
    expect(code).toBe(0);
    expect(stderr).toContain("No external IPs in Beta");
    expect(stdout).toBe("");
  });
});

describe("files from nipa 0.1", () => {
  beforeAll(async () => {
    await freshDir();
    await seedLegacySession(dir, keystone.url);
  });

  test("load as the prod profile", async () => {
    const { stdout } = await run(["whoami", "--json"]);
    expect(JSON.parse(stdout)).toMatchObject({
      profile: "prod",
      project: { name: "Alpha" },
    });
  });

  test("are rewritten in the new format on the next save", async () => {
    await run(["switch", "Beta"]);
    const config = await readJsonFile("config.json");
    const auth = await readJsonFile("auth.json");
    expect(config.currentProfile).toBe("prod");
    expect(config.profiles.prod.authUrl).toBe(keystone.url);
    expect(auth.sessions.prod.project.name).toBe("Beta");
  });
});

describe("broken files", () => {
  beforeAll(freshDir);

  test("an invalid auth.json gives a clear error", async () => {
    await writeFile(path.join(dir, "auth.json"), '{"token": 1}');
    const { code, stderr } = await run(["whoami"]);
    expect(code).toBe(1);
    expect(stderr).toContain("auth.json");
    expect(stderr).toContain("delete it");
  });
});

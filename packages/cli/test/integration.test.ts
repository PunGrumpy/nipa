import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
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
import {
  installFakeKeychain,
  keychainKey,
  readFakeKeychain,
  writeFakeKeychain,
} from "./mocks/keychain";
import { FAKE_USER, startFakeKeystone } from "./mocks/keystone";
import type { FakeKeystone } from "./mocks/keystone";
import {
  FAKE_CONSOLE_LOG,
  FAKE_DATABASES,
  FAKE_IPS,
  FAKE_LOAD_BALANCERS,
  FAKE_NETWORKS,
  FAKE_SERVERS,
  FAKE_VOLUMES,
} from "./mocks/space";

let dir: string;
let keystone: FakeKeystone;

const run = (args: string[], extraEnv: Record<string, string> = {}) =>
  runProcess(["bun", ENTRY, ...args], { ...testEnv(dir), ...extraEnv });

const exists = async (file: string): Promise<boolean> => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};

const runIn = (cwd: string, args: string[]) =>
  runProcess(["bun", ENTRY, ...args], testEnv(dir), cwd);

const exitCode = async (args: string[]): Promise<number> => {
  const { code } = await run(args);
  return code;
};

const inDir = (...parts: string[]) => path.join(dir, ...parts);

const infra = () => inDir("infra");
const modules = () => inDir("infra", "modules");

const readJsonFile = async (name: string) =>
  JSON.parse(await readFile(path.join(dir, name), "utf-8"));

const serverLists = () =>
  keystone.requests.filter((r) => r === "GET /api/v3/instances").length;

const serverChecks = () =>
  keystone.requests.filter((r) => r.startsWith("GET /api/v4/instances/"))
    .length;

const serverActions = () =>
  keystone.requests.filter((r) => r.startsWith("POST /api/v4/instances/"));

const savedKey = () => keychainKey(keystone.url, FAKE_USER.name);

// Every folder gets the fake keychain, so logout never reaches a real one.
const freshDir = async () => {
  await rm(dir, { force: true, recursive: true });
  dir = await mkdtemp(path.join(tmpdir(), "nipa-test-"));
  await installFakeKeychain(dir);
};

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "nipa-test-"));
  await installFakeKeychain(dir);
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

  test("add takes a Space portal URL and saves its API under /api", async () => {
    const { code, stderr } = await run([
      "profile",
      "add",
      "dev",
      "--auth-url",
      keystone.url,
      "--space-url",
      keystone.url,
    ]);
    expect(code).toBe(0);
    const { host } = new URL(keystone.url);
    expect(stderr).toContain(
      `Added profile dev (Keystone v3.14, Space API ${host})`
    );
    expect(stderr).not.toContain("NOTE");
    const config = await readJsonFile("config.json");
    expect(config.profiles.dev.spaceUrl).toBe(`${keystone.url}/api`);
    await run(["profile", "rm", "dev", "--yes"]);
  });

  test("another Keystone without --space-url gets no Space API, and a note", async () => {
    const config = await readJsonFile("config.json");
    expect(config.profiles.staging.spaceUrl).toBeUndefined();
    const { stderr } = await run([
      "profile",
      "add",
      "dev",
      "--auth-url",
      keystone.url,
    ]);
    expect(stderr).toContain(
      "NOTE: dev has no Space API URL, so `nipa server ls` and the other resource commands don't work with it."
    );
    await run(["profile", "rm", "dev", "--yes"]);
  });

  test("add refuses a --space-url that isn't a Space API", async () => {
    const { code, stderr } = await run([
      "profile",
      "add",
      "other",
      "--auth-url",
      keystone.url,
      "--space-url",
      `${keystone.url}/v3`,
    ]);
    expect(code).toBe(1);
    expect(stderr).toContain(
      `${keystone.url}/v3 doesn't answer like the Space API (HTTP 404)`
    );
    const config = await readJsonFile("config.json");
    expect(config.profiles.other).toBeUndefined();
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

describe("completion", () => {
  beforeAll(freshDir);

  test("prints the script for the shell in $SHELL", async () => {
    const { code, stdout } = await run(["completion"], { SHELL: "/bin/zsh" });
    expect(code).toBe(0);
    expect(stdout).toStartWith("#compdef nipa");
  });

  test("without a shell or $SHELL, it asks for one", async () => {
    const { code, stderr } = await run(["completion"]);
    expect(code).toBe(2);
    expect(stderr).toContain("missing <shell>");
    expect(stderr).toContain("`nipa completion zsh`");
  });

  test("--install writes the zsh script to ~/.zfunc and says how to load it", async () => {
    const { code, stderr, stdout } = await run([
      "completion",
      "zsh",
      "--install",
    ]);
    expect(code).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("Installed the zsh completion in ~/.zfunc/_nipa");
    expect(stderr).toContain("Add `fpath=(~/.zfunc $fpath)` to ~/.zshrc");
    const script = await readFile(inDir(".zfunc", "_nipa"), "utf-8");
    expect(script).toStartWith("#compdef nipa");
    expect(script).toContain("'db:List and inspect your databases'");
  });

  test("skips the fpath line when ~/.zshrc already has it", async () => {
    await writeFile(inDir(".zshrc"), "fpath=(~/.zfunc $fpath)\n");
    const { stderr } = await run(["completion", "zsh", "--install"]);
    expect(stderr).toContain("Open a new terminal to use it.");
    expect(stderr).not.toContain("fpath=");
  });

  test("--install finds fish in $SHELL", async () => {
    const { code, stderr } = await run(["completion", "--install"], {
      SHELL: "/usr/local/bin/fish",
    });
    expect(code).toBe(0);
    expect(stderr).toContain(
      "Installed the fish completion in ~/.config/fish/completions/nipa.fish"
    );
  });

  test("PowerShell has no folder to install to", async () => {
    const { code, stderr } = await run(["completion", "pwsh", "--install"]);
    expect(code).toBe(2);
    expect(stderr).toContain("can't install the completion for pwsh");
    expect(stderr).toContain("$PROFILE");
  });

  test("a script from another version is rewritten on the next command", async () => {
    const file = inDir(".zfunc", "_nipa");
    await writeFile(file, "# old\n");
    const cache = inDir(".cache", "nipa", "completion.json");
    const installs = JSON.parse(await readFile(cache, "utf-8"));
    installs.zsh.version = "0.0.1";
    await writeFile(cache, JSON.stringify(installs));
    expect(await exitCode(["profile", "ls"])).toBe(0);
    expect(await readFile(file, "utf-8")).toStartWith("#compdef nipa");
    const after = JSON.parse(await readFile(cache, "utf-8"));
    expect(after.zsh.version).toBe(pkg.version);
    expect(after.fish.version).toBe(pkg.version);
  });

  test("a script from this version stays as it is", async () => {
    const file = inDir(".zfunc", "_nipa");
    await writeFile(file, "# edited\n");
    expect(await exitCode(["profile", "ls"])).toBe(0);
    expect(await readFile(file, "utf-8")).toBe("# edited\n");
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
      kubernetes: null,
      name: "web-1",
      status: "ACTIVE",
    });
    expect(servers[3].kubernetes).toEqual({
      clusterId: "dddd1111-0000-4000-8000-000000000001",
      role: "master",
      version: "1.34.9",
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
    expect(stderr).toMatch(
      /k8s-control-plane-1 \(Kubernetes master\)\s+● Active\s+198\.51\.100\.9/u
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

  test("a profile without a Space API says so before it asks for a login", async () => {
    await freshDir();
    await seedSession(dir, keystone.url);
    const config = await readJsonFile("config.json");
    delete config.profiles.prod.spaceUrl;
    config.profiles.prod.authUrl = `${keystone.url}/v3`;
    await writeFile(path.join(dir, "config.json"), JSON.stringify(config));
    await rm(path.join(dir, "auth.json"));
    const { code, stderr } = await run(["server", "ls"]);
    expect(code).toBe(1);
    expect(stderr).toContain("the prod profile has no Space API URL");
    expect(stderr).toContain("`nipa -P prod os server list`");
    expect(stderr).not.toContain("aren't logged in");
  });

  test("nipa 0.1.4's production Space API on another Keystone is dropped, and a portal URL gets /api", async () => {
    await freshDir();
    await writeFile(
      path.join(dir, "config.json"),
      JSON.stringify({
        currentProfile: "prod",
        profiles: {
          old: {
            authUrl: "https://identity-api.nipa.cloud/v3",
            region: "NCP-TH",
            userDomain: "nipacloud",
          },
          portal: {
            authUrl: "https://keystone.example.com/v3",
            region: "NCP-TH",
            spaceUrl: "https://portal.example.com",
            userDomain: "nipacloud",
          },
          staging: {
            authUrl: "https://keystone.example.com/v3",
            region: "NCP-TH",
            spaceUrl: "https://space.nipa.cloud/api",
            userDomain: "nipacloud",
          },
        },
      })
    );
    const { stdout } = await run(["profile", "ls", "--json"]);
    const profiles = JSON.parse(stdout);
    const byName = (name: string) =>
      profiles.find((p: { name: string }) => p.name === name);
    expect(byName("staging").spaceUrl).toBeUndefined();
    expect(byName("portal").spaceUrl).toBe("https://portal.example.com/api");
    expect(byName("old").spaceUrl).toBe("https://space.nipa.cloud/api");
  });

  test("an unknown subcommand exits 2", async () => {
    const { code, stderr } = await run(["server", "nope"]);
    expect(code).toBe(2);
    expect(stderr).toContain('unknown subcommand "server nope"');
  });
});

describe("server inspect", () => {
  beforeAll(async () => {
    await freshDir();
    await seedSession(dir, keystone.url);
  });

  test("--json prints the server with its volumes, zone and security groups", async () => {
    const { code, stdout } = await run([
      "server",
      "inspect",
      "web-1",
      "--json",
    ]);
    expect(code).toBe(0);
    const { profile, project, server } = JSON.parse(stdout);
    expect(profile).toBe("prod");
    expect(project.name).toBe("Alpha");
    expect(server).toMatchObject({
      flavor: "csa.large.v2",
      id: "22222222-2222-4222-8222-222222222222",
      ramMb: 4096,
      securityGroups: ["default", "web"],
      vcpus: 2,
      volumes: [{ name: "web-1-vol-0", sizeGb: 10 }],
      zone: "NCP-BKK",
    });
    expect(server).toMatchObject({
      lastAction: {
        action: "start",
        remark: null,
        requestId: "req-web1-start",
      },
      locked: true,
      taskState: null,
    });
  });

  test("prints the details on stderr, and the ID to a pipe", async () => {
    const id = "22222222-2222-4222-8222-222222222222";
    const { code, stderr, stdout } = await run(["server", "inspect", id]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/> Server web-1 in Alpha \[\d+(?:ms|s)\]/u);
    expect(stderr).toMatch(/Flavor\s+csa\.large\.v2 \(2 vCPUs, 4 GB RAM\)/u);
    expect(stderr).toMatch(
      /Addresses\s+203\.0\.113\.10 \(external\)\n\s+192\.0\.2\.5\n/u
    );
    expect(stderr).toMatch(
      /Volumes\s+web-1-vol-0 \(10 GB Standard_SSD, boot disk\)/u
    );
    expect(stderr).toMatch(/Security groups\s+default\n\s+web\n/u);
    expect(stderr).toMatch(/Created\s+3d ago/u);
    expect(stderr).toMatch(/Locked\s+yes\n/u);
    expect(stderr).toMatch(/Last action\s+start 1d ago by Ann Example\n/u);
    expect(stderr).not.toContain("Task");
    expect(stderr).not.toContain("nipa server history");
    expect(stderr).not.toContain("Kubernetes");
    expect(stdout).toBe(`${id}\n`);
  });

  test("a Kubernetes node names its role and cluster", async () => {
    const { stderr } = await run(["server", "inspect", "k8s-control-plane-1"]);
    expect(stderr).toMatch(
      /Kubernetes\s+master \(cluster dddd1111-0000-4000-8000-000000000001\)/u
    );
    expect(stderr).toMatch(/Zone\s+-/u);
  });

  test("a server in Error shows its failed action and points to history and logs", async () => {
    const { stderr } = await run(["server", "inspect", "k8s-worker-1"]);
    expect(stderr).toMatch(
      /Last action\s+create failed 61d ago by Ann Example\n/u
    );
    expect(stderr).toContain(
      "> Run `nipa server history k8s-worker-1` to see what failed, and `nipa server logs k8s-worker-1` for its console log."
    );
  });

  test("the hint repeats the ID when the server was named by ID", async () => {
    const id = "55555555-5555-4555-8555-555555555555";
    const { stderr } = await run(["server", "inspect", id]);
    expect(stderr).toContain(
      `> Run \`nipa server history ${id}\` to see what failed, and \`nipa server logs ${id}\` for its console log.`
    );
    expect(stderr).not.toContain("history k8s-worker-1");
  });

  test("a building server shows Nova's task", async () => {
    const { stderr } = await run(["server", "inspect", "web-2"]);
    expect(stderr).toMatch(/Task\s+spawning\n/u);
    expect(stderr).not.toContain("Locked");
  });

  test("still prints the server when its actions can't be read", async () => {
    const id = "22222222-2222-4222-8222-222222222222";
    keystone.faults.set(`GET /api/v4/instances/${id}/action_histories`, 500);
    try {
      const { code, stderr, stdout } = await run(["server", "inspect", id]);
      expect(code).toBe(0);
      expect(stdout).toBe(`${id}\n`);
      expect(stderr).toMatch(/> Server web-1 in Alpha/u);
      expect(stderr).toMatch(/Locked\s+yes\n/u);
      expect(stderr).toMatch(/Last action\s+unavailable\n/u);
      expect(stderr).toContain(
        "> Couldn't load web-1's actions: Internal Server Error. Run the command again, or add `--debug` to see the request."
      );
      const json = await run(["server", "inspect", id, "--json"]);
      expect(json.code).toBe(0);
      expect(JSON.parse(json.stdout).server).toMatchObject({
        lastAction: null,
        locked: true,
        name: "web-1",
        taskState: null,
      });
    } finally {
      keystone.faults.clear();
    }
  });

  test("still prints the server when its state can't be read", async () => {
    const id = "22222222-2222-4222-8222-222222222222";
    keystone.faults.set(`GET /api/v4/instances/${id}`, 503);
    try {
      const { code, stderr, stdout } = await run(["server", "inspect", id]);
      expect(code).toBe(0);
      expect(stdout).toBe(`${id}\n`);
      expect(stderr).toMatch(/Status\s+● Active\n/u);
      expect(stderr).toMatch(/Task\s+unavailable\n\s+Locked\s+unavailable\n/u);
      expect(stderr).toMatch(/Last action\s+start 1d ago by Ann Example\n/u);
      expect(stderr).toContain(
        "> Couldn't load web-1's state: Service Unavailable."
      );
      const json = await run(["server", "inspect", id, "--json"]);
      expect(json.code).toBe(0);
      expect(JSON.parse(json.stdout).server).toMatchObject({
        lastAction: { action: "start" },
        locked: null,
        name: "web-1",
        taskState: null,
      });
    } finally {
      keystone.faults.clear();
    }
  });

  test("fails when the servers themselves can't be read", async () => {
    keystone.faults.set("GET /api/v3/instances", 503);
    try {
      const { code, stderr, stdout } = await run([
        "server",
        "inspect",
        "web-1",
      ]);
      expect(code).toBe(1);
      expect(stdout).toBe("");
      expect(stderr).toContain("Error: Service Unavailable");
      expect(stderr).not.toContain("Server web-1");
    } finally {
      keystone.faults.clear();
    }
  });

  test("an unknown server points to server ls", async () => {
    const { code, stderr, stdout } = await run(["server", "inspect", "nope"]);
    expect(code).toBe(1);
    expect(stderr).toContain('no server named or with ID "nope" in Alpha');
    expect(stderr).toContain("Run `nipa server ls` to see your servers.");
    expect(stdout).toBe("");
  });

  test("a missing server argument exits 2", async () => {
    const { code } = await run(["server", "inspect"]);
    expect(code).toBe(2);
  });
});

describe("server logs", () => {
  beforeAll(async () => {
    await freshDir();
    await seedSession(dir, keystone.url);
  });

  test("prints the console log on stdout as it is", async () => {
    const { code, stderr, stdout } = await run(["server", "logs", "web-1"]);
    expect(code).toBe(0);
    expect(stdout).toBe(FAKE_CONSOLE_LOG);
    // No newline is added after the login prompt the log ends in.
    expect(stdout.endsWith("login: ")).toBe(true);
    expect(stderr).toMatch(/> Console log of web-1 in Alpha \[\d+(?:ms|s)\]/u);
  });

  test("--tail keeps the last lines, and -n is the same", async () => {
    const last2 =
      "[  OK  ] Reached target cloud-init.target - Cloud-init target.\nweb-1 login: \n";
    const long = await run(["server", "logs", "web-1", "--tail", "2"]);
    const short = await run(["server", "logs", "web-1", "-n", "2"]);
    expect(long.stdout).toBe(last2);
    expect(short.stdout).toBe(last2);
  });

  test("--json prints the server and its log", async () => {
    const { code, stdout } = await run([
      "server",
      "logs",
      "web-1",
      "-n",
      "1",
      "--json",
    ]);
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      logs: "web-1 login: \n",
      profile: "prod",
      project: expect.objectContaining({ name: "Alpha" }),
      server: { id: "22222222-2222-4222-8222-222222222222", name: "web-1" },
    });
  });

  test("a server that never booted has none, and points to history", async () => {
    const { code, stderr, stdout } = await run([
      "server",
      "logs",
      "k8s-worker-1",
    ]);
    expect(code).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: k8s-worker-1 has no console log yet");
    expect(stderr).toContain(
      "A server has one once it boots, so this one most likely never booted. Run `nipa server history k8s-worker-1` to see what failed."
    );
    expect(stderr).not.toContain("Something went wrong");
  });

  test("the hint repeats the ID when the server was named by ID", async () => {
    const id = "55555555-5555-4555-8555-555555555555";
    const { code, stderr } = await run(["server", "logs", id]);
    expect(code).toBe(1);
    expect(stderr).toContain("Error: k8s-worker-1 has no console log yet");
    expect(stderr).toContain(
      `Run \`nipa server history ${id}\` to see what failed.`
    );
    expect(stderr).not.toContain("history k8s-worker-1");
  });

  test("--tail takes a whole number above 0", async () => {
    const { code, stderr } = await run(["server", "logs", "web-1", "-n", "0"]);
    expect(code).toBe(2);
    expect(stderr).toContain('"0" isn\'t a number of lines');
    expect(stderr).toContain("such as `--tail 50`");
  });

  test("an unknown server points to server ls", async () => {
    const { code, stderr } = await run(["server", "logs", "nope"]);
    expect(code).toBe(1);
    expect(stderr).toContain('no server named or with ID "nope" in Alpha');
  });
});

describe("server history", () => {
  beforeAll(async () => {
    await freshDir();
    await seedSession(dir, keystone.url);
  });

  test("lists the actions newest first, and their request IDs to a pipe", async () => {
    const { code, stderr, stdout } = await run(["server", "history", "web-1"]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/> Actions on web-1 in Alpha \[\d+(?:ms|s)\]/u);
    expect(stderr).toMatch(
      /Age\s+Action\s+User\s+Result\s+Request ID\n\s+1d\s+start\s+Ann Example\s+-\s+req-web1-start\n\s+2d\s+stop\s+Ann Example\s+-\s+req-web1-stop\n\s+3d\s+create\s+Ann Example\s+-\s+req-22222222-create\n/u
    );
    expect(stdout).toBe("req-web1-start\nreq-web1-stop\nreq-22222222-create\n");
  });

  test("events is the same command, and a failed action says Error", async () => {
    const { stderr } = await run(["server", "events", "k8s-worker-1"]);
    expect(stderr).toMatch(
      /create\s+Ann Example\s+Error\s+req-55555555-create/u
    );
  });

  test("--json prints the server and its actions", async () => {
    const { code, stdout } = await run([
      "server",
      "history",
      "k8s-worker-1",
      "--json",
    ]);
    expect(code).toBe(0);
    const { actions, profile, server } = JSON.parse(stdout);
    expect(profile).toBe("prod");
    expect(server).toEqual({
      id: "55555555-5555-4555-8555-555555555555",
      name: "k8s-worker-1",
    });
    expect(actions).toEqual([
      {
        action: "create",
        remark: "Error",
        requestId: "req-55555555-create",
        startedAt: expect.stringMatching(/Z$/u),
        user: "Ann Example",
      },
    ]);
  });
});

describe("server start, stop and restart", () => {
  beforeAll(async () => {
    await freshDir();
    await seedSession(dir, keystone.url);
  });

  test("stop needs --yes without a terminal, and sends nothing", async () => {
    const before = serverActions().length;
    const { code, stderr } = await run(["server", "stop", "web-1"]);
    expect(code).toBe(2);
    expect(stderr).toContain("stopping web-1 needs confirmation");
    expect(stderr).toContain("Add `--yes` to stop it without asking.");
    expect(serverActions()).toHaveLength(before);
  });

  test("stop --yes stops the server and waits for it", async () => {
    const { code, stderr, stdout } = await run([
      "server",
      "stop",
      "web-1",
      "-y",
    ]);
    expect(code).toBe(0);
    expect(stderr).toMatch(
      /> Success! Stopped web-1 in Alpha \[\d+(?:ms|s)\]/u
    );
    expect(stdout).toBe("");
    expect(serverActions().at(-1)).toBe(
      "POST /api/v4/instances/22222222-2222-4222-8222-222222222222/action/stop"
    );
    expect(keystone.requests).toContain(
      "GET /api/v4/instances/22222222-2222-4222-8222-222222222222"
    );
    const { stderr: list } = await run(["server", "ls"]);
    expect(list).toMatch(/web-1\s+● Shutoff/u);
  });

  test("a stopped server: stop is a no-op, restart says to start it", async () => {
    const before = serverActions().length;
    const stop = await run(["server", "stop", "web-1", "--yes"]);
    expect(stop.code).toBe(0);
    expect(stop.stderr).toContain("NOTE: web-1 is already stopped");
    const restart = await run(["server", "restart", "web-1", "--yes"]);
    expect(restart.code).toBe(1);
    expect(restart.stderr).toContain("Error: web-1 is stopped");
    expect(restart.stderr).toContain(
      "Run `nipa server start web-1` to start it."
    );
    expect(serverActions()).toHaveLength(before);
  });

  test("start needs no confirmation", async () => {
    const { code, stderr } = await run(["server", "start", "web-1"]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/> Success! Started web-1 in Alpha/u);
    const again = await run(["server", "start", "web-1"]);
    expect(again.stderr).toContain("NOTE: web-1 is already running");
  });

  test("restart and its reboot alias restart a running server", async () => {
    const { code, stderr } = await run(["server", "reboot", "web-1", "--yes"]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/> Success! Restarted web-1 in Alpha/u);
    expect(serverActions().at(-1)).toBe(
      "POST /api/v4/instances/22222222-2222-4222-8222-222222222222/action/restart"
    );
  });

  test("a bad --timeout, or --timeout with --no-wait, exits 2 before anything", async () => {
    const before = keystone.requests.length;
    const bad = await run(["server", "start", "web-1", "--timeout", "5x"]);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain('"5x" isn\'t a duration');
    expect(bad.stderr).toContain("such as `--timeout 90s` or `--timeout 10m`.");
    const both = await run([
      "server",
      "stop",
      "web-1",
      "-y",
      "--no-wait",
      "--timeout",
      "1m",
    ]);
    expect(both.code).toBe(2);
    expect(both.stderr).toContain("--no-wait and --timeout don't go together");
    expect(keystone.requests).toHaveLength(before);
  });

  test("--no-wait sends the action and returns without checking", async () => {
    const before = serverChecks();
    const { code, stderr, stdout } = await run([
      "server",
      "stop",
      "web-1",
      "--yes",
      "--no-wait",
    ]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/> Success! Asked to stop web-1 in Alpha/u);
    expect(stderr).toContain("Run `nipa server inspect web-1` to check on it.");
    expect(stderr).not.toContain("Stopped web-1");
    expect(stdout).toBe("");
    expect(serverChecks()).toBe(before);
    const started = await run(["server", "start", "web-1", "--timeout", "90s"]);
    expect(started.code).toBe(0);
    expect(started.stderr).toMatch(/> Success! Started web-1 in Alpha/u);
  });

  test("a failed check after the action says nipa already sent it", async () => {
    const { code, stderr } = await run(["server", "start", "db-1"]);
    expect(code).toBe(1);
    expect(stderr).toContain("Error: Service Unavailable");
    expect(stderr).toContain(
      "nipa asked to start db-1 before this failed. Run `nipa server inspect db-1` to check it."
    );
    expect(stderr).not.toContain("--debug");
    expect(stderr).not.toContain("Success!");
  });

  test("Nova's refusal comes through as the error", async () => {
    // web-2 is still building, so Nova won't stop it.
    const { code, stderr } = await run(["server", "stop", "web-2", "--yes"]);
    expect(code).toBe(1);
    expect(stderr).toContain("Cannot 'stop' instance");
  });
});

const installTool = async (tool: string) => {
  await writeFile(inDir("bin", tool), "#!/bin/sh\n");
  await chmod(inDir("bin", tool), 0o755);
};

const keystoneHost = () => new URL(keystone.url).host;

const installTools = async () => {
  await mkdir(inDir("bin"), { recursive: true });
  await Promise.all(["openstack", "terraform"].map(installTool));
};

const seedHealthy = async () => {
  await freshDir();
  await seedSession(dir, keystone.url);
  await installTools();
};

describe("doctor", () => {
  test("a healthy profile passes every check", async () => {
    await seedHealthy();
    const { code, stderr, stdout } = await run(["doctor"]);
    expect(code).toBe(0);
    expect(stdout).toBe("");
    const lines = stderr.trimEnd().split("\n");
    expect(lines.map((line) => line.replaceAll(/\[\d+m?s\]/gu, "[t]"))).toEqual(
      [
        `✔ Config files    config.json and auth.json in ${dir} are valid`,
        `✔ Profile         prod (${keystoneHost()}), the current profile`,
        `✔ Keystone        ${keystoneHost()} answers as Keystone v3.14 [t]`,
        `✔ Space API       ${keystoneHost()} answers as the Space API [t]`,
        "✔ Session         Logged in as me@example.com to Alpha, expires in 59m",
        "✔ Token           Keystone and the Space API accept the token [t]",
        "✔ Linked folder   This folder isn't linked",
        "✔ Tools           Found openstack and terraform",
        `✔ Update          You have nipa ${pkg.version}`,
        "",
        "> 9 passed",
      ]
    );
  });

  test("--json prints only the checks on stdout, without the token", async () => {
    await seedHealthy();
    const auth = await readJsonFile("auth.json");
    const { token } = auth.sessions.prod;
    const { code, stderr, stdout } = await run(["doctor", "--json"]);
    expect(code).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).not.toContain(token);
    const report = JSON.parse(stdout);
    expect(report.profile).toBe("prod");
    expect(
      report.checks.map(
        (check: { id: string; status: string }) => `${check.id} ${check.status}`
      )
    ).toEqual([
      "config pass",
      "profile pass",
      "keystone pass",
      "space pass",
      "session pass",
      "token pass",
      "link pass",
      "tools pass",
      "update pass",
    ]);
    expect(report.checks[6]).toEqual({
      hint: null,
      id: "link",
      status: "pass",
      summary: "This folder isn't linked",
      title: "Linked folder",
    });
  });

  test("a missing session fails with the login hint and skips the token", async () => {
    await seedHealthy();
    await rm(inDir("auth.json"));
    const { code, stderr } = await run(["doctor"]);
    expect(code).toBe(1);
    expect(stderr).toContain(
      "✖ Session         You aren't logged in to prod\n                  > Run `nipa login`.\n"
    );
    expect(stderr).toContain(
      "- Token           Skipped because Session didn't pass\n"
    );
    expect(stderr).toContain("> 7 passed, 1 failed, 1 skipped\n");
  });

  test("a revoked token fails without logging in", async () => {
    await seedHealthy();
    const auth = await readJsonFile("auth.json");
    const { token } = auth.sessions.prod;
    await fetch(`${keystone.url}/v3/auth/tokens`, {
      headers: { "X-Auth-Token": token, "X-Subject-Token": token },
      method: "DELETE",
    });
    const before = keystone.requests.length;
    const { code, stderr } = await run(["doctor"]);
    expect(code).toBe(1);
    expect(stderr).toContain(
      "✖ Token           Keystone refuses the token, so it was revoked\n                  > Run `nipa login`.\n"
    );
    expect(keystone.requests.slice(before)).not.toContain(
      "POST /v3/auth/tokens"
    );
  });

  test("an unreachable Keystone fails and skips the token", async () => {
    await seedHealthy();
    const config = await readJsonFile("config.json");
    // Nothing listens on port 1, so the connection fails at once.
    config.profiles.prod.authUrl = "http://127.0.0.1:1/v3";
    await writeFile(inDir("config.json"), JSON.stringify(config));
    const { code, stderr } = await run(["doctor"]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/^✖ Keystone {8}Can't reach 127\.0\.0\.1:1: /mu);
    expect(stderr).toContain(
      "> Check the Keystone URL with `nipa profile ls`, or your network connection."
    );
    expect(stderr).toContain(
      "- Token           Skipped because Keystone didn't pass"
    );
  });

  test("a profile without a Space API URL warns, and the token check uses Keystone alone", async () => {
    await seedHealthy();
    const config = await readJsonFile("config.json");
    delete config.profiles.prod.spaceUrl;
    await writeFile(inDir("config.json"), JSON.stringify(config));
    const { code, stderr } = await run(["doctor"]);
    expect(code).toBe(0);
    expect(stderr).toContain(
      "! Space API       The prod profile has no Space API URL\n                  > Remove it with `nipa profile rm prod`, then add it again with `--space-url` and its Space portal URL. `nipa -P prod os server list` works without one.\n"
    );
    expect(stderr).toMatch(
      /^✔ Token {11}Keystone accepts the token \[\d+m?s\]$/mu
    );
    expect(stderr).toContain("> 8 passed, 1 warning\n");
  });

  test("missing tools and a known update warn without failing", async () => {
    await freshDir();
    await seedSession(dir, keystone.url);
    await mkdir(inDir(".cache", "nipa"), { recursive: true });
    await writeFile(
      inDir(".cache", "nipa", "update.json"),
      JSON.stringify({ checkedAt: new Date().toISOString(), latest: "99.0.0" })
    );
    const { code, stderr, stdout } = await run(["doctor", "--json"], {
      PATH: path.dirname(process.execPath),
    });
    expect(code).toBe(0);
    const { checks } = JSON.parse(stdout);
    expect(stderr).toBe("");
    expect(checks.slice(-2)).toEqual([
      {
        hint: "Install it with `pipx install python-openstackclient`. Install it with `brew install hashicorp/tap/terraform`.",
        id: "tools",
        status: "warn",
        summary:
          "Can't find openstack and terraform, so `nipa os` and `nipa tf` won't run",
        title: "Tools",
      },
      {
        hint: "Run `npm install -g nipa-cli`, or download it from https://github.com/PunGrumpy/nipa/releases/tag/v99.0.0.",
        id: "update",
        status: "warn",
        summary: `nipa 99.0.0 is out, and you have ${pkg.version}`,
        title: "Update",
      },
    ]);
  });

  test("a broken config.json fails, names the file, and skips the profile", async () => {
    await seedHealthy();
    await writeFile(inDir("config.json"), "{");
    const { code, stdout } = await run(["doctor", "--json"]);
    expect(code).toBe(1);
    const { checks, profile } = JSON.parse(stdout);
    expect(profile).toBeNull();
    expect(checks.slice(0, 2)).toEqual([
      {
        hint: "Fix the file, or delete it and run `nipa login` again.",
        id: "config",
        status: "fail",
        summary: `${inDir("config.json")} isn't valid JSON`,
        title: "Config files",
      },
      {
        hint: null,
        id: "profile",
        status: "skip",
        summary: "Skipped because Config files didn't pass",
        title: "Profile",
      },
    ]);
  });

  test("a folder linked to another project says commands switch to it, unless the account can't use it", async () => {
    await seedHealthy();
    await mkdir(path.join(infra(), ".nipa"), { recursive: true });
    await writeFile(
      path.join(infra(), ".nipa", "project.json"),
      JSON.stringify({
        profile: "prod",
        project: { id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", name: "Beta" },
      })
    );
    const { stderr } = await runIn(infra(), ["doctor"]);
    expect(stderr).toContain(
      `✔ Profile         prod (${keystoneHost()}), from .nipa/project.json`
    );
    expect(stderr).toContain(
      "✔ Linked folder   .nipa/project.json links Beta, so commands here switch to it for each run"
    );
    await writeFile(
      path.join(infra(), ".nipa", "project.json"),
      JSON.stringify({
        profile: "prod",
        project: { id: "cccccccccccccccccccccccccccccccc", name: "Gone" },
      })
    );
    const gone = await runIn(infra(), ["doctor"]);
    expect(gone.code).toBe(1);
    expect(gone.stderr).toContain(
      "✖ Linked folder   .nipa/project.json links Gone, which your account can't use\n                  > Run `nipa link` to pick another project.\n"
    );
  });
  test("a link file that isn't JSON fails the Linked folder check, and the other checks still run", async () => {
    await seedHealthy();
    await mkdir(path.join(infra(), ".nipa"), { recursive: true });
    await writeFile(path.join(infra(), ".nipa", "project.json"), "{ nope");
    const { code, stderr } = await runIn(infra(), ["doctor"]);
    expect(code).toBe(1);
    expect(stderr).toContain(
      `✔ Profile         prod (${keystoneHost()}), the current profile`
    );
    expect(stderr).toMatch(/^✔ Keystone {8}/mu);
    expect(stderr).toMatch(/^✔ Space API {7}/mu);
    expect(stderr).toMatch(/^✔ Token {11}/mu);
    // The message names the file by its real path, which macOS prefixes with /private.
    expect(stderr).toMatch(
      /^✖ Linked folder {3}\S+\/infra\/\.nipa\/project\.json isn't valid JSON\n {18}> Fix the file, or run `nipa unlink` and `nipa link` again\.\n/mu
    );
    expect(stderr).toContain("> 8 passed, 1 failed\n");
  });
});

describe("link", () => {
  const BETA_ID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const ALPHA_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  beforeAll(async () => {
    await freshDir();
    await seedSession(dir, keystone.url);
    await mkdir(modules(), { recursive: true });
  });

  test("without a project and without a terminal, lists the projects", async () => {
    const { code, stderr } = await runIn(infra(), ["link"]);
    expect(code).toBe(2);
    expect(stderr).toContain("tell nipa which project to link");
    expect(stderr).toContain("Your projects: Alpha, Beta");
    expect(await exists(path.join(infra(), ".nipa"))).toBe(false);
  });

  test("links the folder to a project and profile", async () => {
    const { code, stderr, stdout } = await runIn(infra(), ["link", "Beta"]);
    expect(code).toBe(0);
    expect(stderr).toContain(
      "Success! Linked .nipa/project.json to Beta (prod)"
    );
    expect(stderr).toContain(
      "Commands in this folder now use Beta. Run `nipa unlink` to stop."
    );
    expect(stdout).toBe("");
    const saved = JSON.parse(
      await readFile(path.join(infra(), ".nipa", "project.json"), "utf-8")
    );
    expect(saved).toMatchObject({
      profile: "prod",
      project: { id: BETA_ID, name: "Beta" },
    });
    const again = await runIn(infra(), ["link", "Beta"]);
    expect(again.code).toBe(0);
    expect(again.stderr).toContain(
      "NOTE: This folder is already linked to Beta"
    );
  });

  test("a folder below uses the linked project, and the saved one stays", async () => {
    const { code, stderr, stdout } = await runIn(modules(), ["env"]);
    expect(code).toBe(0);
    expect(stdout).toContain(BETA_ID);
    expect(stderr).toContain("Using project Beta from ../.nipa/project.json");
    const auth = await readJsonFile("auth.json");
    expect(auth.sessions.prod.project.id).toBe(ALPHA_ID);
    const outside = await run(["env"]);
    expect(outside.stdout).toContain(ALPHA_ID);
    expect(outside.stderr).not.toContain("Using project");
  });

  test("whoami --json names the linked project beside the saved one", async () => {
    const linked = await runIn(infra(), ["whoami", "--json"]);
    const json = JSON.parse(linked.stdout);
    expect(json.project.name).toBe("Alpha");
    expect(json.link.project.name).toBe("Beta");
    const outside = await run(["whoami", "--json"]);
    expect(JSON.parse(outside.stdout).link).toBeNull();
  });

  test("switch changes the saved project, and says the link still wins", async () => {
    const same = await runIn(infra(), ["switch", "Alpha"]);
    expect(same.stderr).toContain("You're already using Alpha");
    await runIn(infra(), ["switch", "Beta"]);
    const { code, stderr } = await runIn(infra(), ["switch", "Alpha"]);
    expect(code).toBe(0);
    expect(stderr).toContain("Switched to Alpha");
    expect(stderr).toContain(
      "Commands in this folder still use Beta, from .nipa/project.json. Run `nipa unlink` to use Alpha here too."
    );
  });

  test("a link to a missing profile says where it comes from, and -P skips it", async () => {
    const other = inDir("other");
    await mkdir(path.join(other, ".nipa"), { recursive: true });
    await writeFile(
      path.join(other, ".nipa", "project.json"),
      JSON.stringify({
        profile: "staging",
        project: { id: BETA_ID, name: "Beta" },
      })
    );
    const { code, stderr } = await runIn(other, ["env"]);
    expect(code).toBe(1);
    expect(stderr).toContain(
      'no profile named "staging" in .nipa/project.json'
    );
    const withProd = await runIn(other, ["-P", "prod", "env"]);
    expect(withProd.code).toBe(0);
    expect(withProd.stdout).toContain(ALPHA_ID);
  });

  test("a broken link file says how to fix it", async () => {
    const broken = inDir("broken");
    await mkdir(path.join(broken, ".nipa"), { recursive: true });
    await writeFile(path.join(broken, ".nipa", "project.json"), "{");
    const { code, stderr } = await runIn(broken, ["env"]);
    expect(code).toBe(1);
    expect(stderr).toContain("project.json isn't valid JSON");
    expect(stderr).toContain(
      "Fix the file, or run `nipa unlink` and `nipa link` again."
    );
  });

  test("tab completion lists the linked project's names", async () => {
    const words = ["__complete", "openstack", "--", "server", "create"];
    const linked = await runIn(modules(), [...words, "--network", ""]);
    expect(linked.stdout.trim().split("\n")).toEqual(FAKE_NETWORKS.slice(1));
    const outside = await run([...words, "--network", ""]);
    expect(outside.stdout.trim().split("\n")).toEqual(FAKE_NETWORKS);
  });

  test("unlink deletes the closest link, then has nothing to do", async () => {
    const { code, stderr } = await runIn(modules(), ["unlink"]);
    expect(code).toBe(0);
    expect(stderr).toContain(
      "Success! Unlinked ../.nipa/project.json from Beta"
    );
    expect(await exists(path.join(infra(), ".nipa"))).toBe(false);
    const again = await runIn(modules(), ["unlink"]);
    expect(again.code).toBe(0);
    expect(again.stderr).toContain(
      "NOTE: This folder isn't linked to a project"
    );
  });
});

describe("saved passwords and session expiry", () => {
  beforeEach(async () => {
    await freshDir();
    await seedSession(dir, keystone.url);
  });

  test("login --remember without a terminal fails before the keychain", async () => {
    const { code, stderr } = await run(["login", "--remember"]);
    expect(code).toBe(1);
    expect(stderr).toContain("`nipa login` needs a terminal");
    expect(await readFakeKeychain(dir)).toEqual({});
  });

  test("logout deletes the saved password too", async () => {
    await writeFakeKeychain(dir, { [savedKey()]: "secret" });
    const { code, stderr } = await run(["logout"]);
    expect(code).toBe(0);
    expect(stderr).toContain("Success! Logged out of prod");
    expect(stderr).toContain("Deleted your saved password.");
    expect(await readFakeKeychain(dir)).toEqual({});
  });

  test("logout without a session still deletes a saved password", async () => {
    await rm(path.join(dir, "auth.json"));
    await writeFakeKeychain(dir, { [savedKey()]: "secret" });
    const { code, stderr } = await run(["logout"]);
    expect(code).toBe(0);
    expect(stderr).toContain("Success! Deleted your saved password for prod");
    expect(stderr).not.toContain("did nothing");
    expect(await readFakeKeychain(dir)).toEqual({});
  });

  test("logout without a saved password says nothing about one", async () => {
    const { stderr } = await run(["logout"]);
    expect(stderr).toContain("Success! Logged out of prod");
    expect(stderr).not.toContain("saved password");
  });

  test("a session that ends within 30 minutes gets a note first", async () => {
    const auth = await readJsonFile("auth.json");
    auth.sessions.prod.expiresAt = new Date(
      Date.now() + 10 * 60_000
    ).toISOString();
    await writeFile(path.join(dir, "auth.json"), JSON.stringify(auth));
    const { code, stderr, stdout } = await run(["env"]);
    expect(code).toBe(0);
    expect(stderr).toMatch(
      /NOTE: Your prod session expires in (?:9|10)m\. Run `nipa login` to start a new one\./u
    );
    expect(stdout).not.toContain("NOTE");
  });

  test("a session with more time left gets no note", async () => {
    const { stderr } = await run(["env"]);
    expect(stderr).not.toContain("session expires");
  });
});

describe("flavor ls", () => {
  beforeAll(async () => {
    await freshDir();
    await seedSession(dir, keystone.url);
  });

  test("--json lists the server flavors, smallest first", async () => {
    const { code, stdout } = await run(["flavor", "ls", "--json"]);
    expect(code).toBe(0);
    const { flavors, project } = JSON.parse(stdout);
    expect(project.name).toBe("Alpha");
    expect(flavors.map((f: { name: string }) => f.name)).toEqual([
      "nsa.small.v2",
      "csa.large.v2",
      "csa.xlarge.v2",
    ]);
    expect(flavors.slice(1)).toEqual([
      {
        cpuPolicy: "shared",
        id: "mt-csa.large.v2",
        name: "csa.large.v2",
        ramMb: 4096,
        type: "Shared-Core",
        vcpus: 2,
      },
      {
        cpuPolicy: "shared",
        id: "mt-csa.xlarge.v2",
        name: "csa.xlarge.v2",
        ramMb: 8192,
        type: "Shared-Core",
        vcpus: 4,
      },
    ]);
  });

  test("prints a table on stderr and one name per line to a pipe", async () => {
    const { code, stderr, stdout } = await run(["machine-types"]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/> Flavors in Alpha \[\d+(?:ms|s)\]/u);
    expect(stderr).toMatch(/Name\s+vCPUs\s+RAM\s+Type/u);
    expect(stderr).toMatch(/csa\.xlarge\.v2\s+4\s+8 GB\s+Shared-Core/u);
    expect(stderr).toMatch(/nsa\.small\.v2\s+1\s+1\.5 GB\s+Shared-core/u);
    expect(stderr).not.toContain("dsa.large.v2");
    expect(stdout.trim().split("\n")).toEqual([
      "nsa.small.v2",
      "csa.large.v2",
      "csa.xlarge.v2",
    ]);
  });
});

describe("volume ls", () => {
  beforeAll(async () => {
    await freshDir();
    await seedSession(dir, keystone.url);
  });

  test("--json lists the project's volumes, without asking for the servers", async () => {
    const before = serverLists();
    const { code, stdout } = await run(["volume", "ls", "--json"]);
    expect(code).toBe(0);
    const { project, volumes } = JSON.parse(stdout);
    expect(project.name).toBe("Alpha");
    expect(volumes.map((v: { id: string }) => v.id)).toEqual(
      FAKE_VOLUMES.map((v) => v.id).toReversed()
    );
    expect(volumes[1]).toMatchObject({
      attachments: [
        {
          device: "/dev/vda",
          serverId: "22222222-2222-4222-8222-222222222222",
        },
      ],
      bootable: true,
      name: "web-1-vol-0",
      sizeGb: 10,
      status: "in-use",
      type: "Standard_SSD",
      zone: "NCP-BKK",
    });
    expect(serverLists()).toBe(before);
  });

  test("prints a table with each volume's server, and one ID per line to a pipe", async () => {
    const { code, stderr, stdout } = await run(["volumes"]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/> Volumes in Alpha \[\d+(?:ms|s)\]/u);
    expect(stderr).toMatch(/Name\s+Status\s+Size\s+Type\s+Server\s+Age/u);
    expect(stderr).toMatch(
      /web-1-vol-0\s+● In use\s+10 GB\s+Standard_SSD\s+web-1\s+3d/u
    );
    expect(stderr).toMatch(
      /backups\s+● Available\s+100 GB\s+Standard_SSD\s+-\s+10d/u
    );
    expect(stderr).toMatch(/-\s+● Creating\s+20 GB\s+-\s+-\s+1m/u);
    expect(stdout.trim().split("\n")).toEqual(
      FAKE_VOLUMES.map((v) => v.id).toReversed()
    );
  });

  test("a project without volumes says so", async () => {
    await run(["switch", "Beta"]);
    const { code, stderr, stdout } = await run(["volume", "ls"]);
    expect(code).toBe(0);
    expect(stderr).toContain("No volumes in Beta");
    expect(stdout).toBe("");
  });
});

describe("quota ls", () => {
  beforeAll(async () => {
    await freshDir();
    await seedSession(dir, keystone.url);
  });

  test("--json lists each quota by group, with null for an unlimited limit", async () => {
    const { code, stdout } = await run(["quota", "ls", "--json"]);
    expect(code).toBe(0);
    const { profile, project, quotas } = JSON.parse(stdout);
    expect(profile).toBe("prod");
    expect(project.name).toBe("Alpha");
    expect(quotas).toEqual([
      {
        group: "compute",
        limit: 10,
        name: "instances",
        unit: null,
        used: 10,
      },
      {
        group: "compute",
        limit: 20,
        name: "cores",
        unit: null,
        used: 18,
      },
      {
        group: "compute",
        limit: 51_200,
        name: "ram",
        unit: "MB",
        used: 45_056,
      },
      {
        group: "network",
        limit: null,
        name: "port",
        unit: null,
        used: 11,
      },
      {
        group: "objectStorage",
        limit: null,
        name: "storage_size",
        unit: "Bytes",
        used: 1_755_585,
      },
      {
        group: "fileStorage",
        limit: 5,
        name: "shares",
        unit: null,
        used: 1,
      },
    ]);
  });

  test("prints a table by group, names the full and near quotas, and exits 0", async () => {
    const { code, stderr, stdout } = await run(["limits"]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/> Quotas of Alpha \[\d+(?:ms|s)\]/u);
    expect(stderr).toMatch(/Group\s+Quota\s+Used\s+Limit\s+%/u);
    expect(stderr).toMatch(/ {2}Compute\s+Servers\s+10\s+10\s+100%\n/u);
    expect(stderr).toMatch(/\n {5,}vCPUs\s+18\s+20\s+90%\n/u);
    expect(stderr).toMatch(/\n {5,}RAM\s+44 GB\s+50 GB\s+88%\n/u);
    expect(stderr).toMatch(/Network\s+Ports\s+11\s+unlimited\s+-\n/u);
    expect(stderr).toMatch(
      /Object storage\s+Storage\s+1\.7 MB\s+unlimited\s+-\n/u
    );
    expect(stderr).toMatch(/File storage\s+Shares\s+1\s+5\s+20%\n/u);
    expect(stderr).toContain(
      "> NOTE: 1 quota is at the limit, and 2 are near it."
    );
    expect(stdout.trim().split("\n")).toEqual([
      "compute/instances\t10\t10\t-",
      "compute/cores\t18\t20\t-",
      "compute/ram\t45056\t51200\tMB",
      "network/port\t11\tunlimited\t-",
      "objectStorage/storage_size\t1755585\tunlimited\tBytes",
      "fileStorage/shares\t1\t5\t-",
    ]);
  });

  test("a project without quotas says so", async () => {
    await run(["switch", "Beta"]);
    const { code, stderr, stdout } = await run(["quotas"]);
    expect(code).toBe(0);
    expect(stderr).toContain("No quotas for Beta");
    expect(stdout).toBe("");
  });
});

describe("network ls", () => {
  beforeAll(async () => {
    await freshDir();
    await seedSession(dir, keystone.url);
  });

  test("--json lists the networks the project can use, newest first", async () => {
    const { code, stdout } = await run(["network", "ls", "--json"]);
    expect(code).toBe(0);
    const { networks, project } = JSON.parse(stdout);
    expect(project.name).toBe("Alpha");
    expect(networks.map((n: { name: string }) => n.name)).toEqual(
      FAKE_NETWORKS
    );
    expect(networks[1]).toMatchObject({
      external: true,
      shared: true,
      status: "ACTIVE",
      zone: null,
    });
    expect(networks[1].createdAt).toEndWith("Z");
  });

  test("prints a table on stderr and one ID per line to a pipe", async () => {
    const { code, stderr, stdout } = await run(["networks"]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/> Networks in Alpha \[\d+(?:ms|s)\]/u);
    expect(stderr).toMatch(/Name\s+Status\s+Type\s+Zone\s+Age/u);
    expect(stderr).toMatch(/default\s+● Active\s+VPC\s+NCP-BKK\s+20d/u);
    expect(stderr).toMatch(
      /Standard_Public_IP_Pool_BKK\s+● Active\s+external\s+-\s+400d/u
    );
    expect(stdout.trim().split("\n")).toEqual([
      "nnnn1111-0000-4000-8000-000000000001",
      "nnnn2222-0000-4000-8000-000000000002",
    ]);
  });

  test("another project sees only the shared networks", async () => {
    await run(["switch", "Beta"]);
    const { code, stderr } = await run(["network", "ls"]);
    expect(code).toBe(0);
    expect(stderr).toContain("Networks in Beta");
    expect(stderr).toContain("Standard_Public_IP_Pool_BKK");
    expect(stderr).not.toContain("VPC");
  });
});

describe("sg ls", () => {
  beforeAll(async () => {
    await freshDir();
    await seedSession(dir, keystone.url);
  });

  test("--json lists the project's security groups with their rules", async () => {
    const { code, stdout } = await run(["sg", "ls", "--json"]);
    expect(code).toBe(0);
    const { project, securityGroups } = JSON.parse(stdout);
    expect(project.name).toBe("Alpha");
    expect(securityGroups.map((g: { name: string }) => g.name)).toEqual([
      "web",
      "default",
    ]);
    expect(securityGroups[0]).toMatchObject({
      description: null,
      rules: [
        {
          direction: "ingress",
          portMax: 443,
          portMin: 443,
          protocol: "tcp",
          remoteGroupId: null,
          remoteIpPrefix: "0.0.0.0/0",
        },
        { portMax: 22, portMin: 22, protocol: "6" },
      ],
    });
  });

  test("prints a table on stderr and one ID per line to a pipe", async () => {
    const { code, stderr, stdout } = await run(["security-groups"]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/> Security groups in Alpha \[\d+(?:ms|s)\]/u);
    expect(stderr).toMatch(/Name\s+Inbound\s+Outbound\s+Age\s+Description/u);
    expect(stderr).toMatch(/web\s+2\s+0\s+2d\s+-/u);
    expect(stderr).toMatch(/default\s+1\s+2\s+30d\s+Default security group/u);
    expect(stdout.trim().split("\n")).toEqual([
      "ssss2222-0000-4000-8000-000000000002",
      "ssss1111-0000-4000-8000-000000000001",
    ]);
  });

  test("a project without security groups says so", async () => {
    await run(["switch", "Beta"]);
    const { code, stderr, stdout } = await run(["sg"]);
    expect(code).toBe(0);
    expect(stderr).toContain("No security groups in Beta");
    expect(stdout).toBe("");
  });
});

describe("sg inspect", () => {
  beforeAll(async () => {
    await freshDir();
    await seedSession(dir, keystone.url);
  });

  test("--json adds each rule's remote group name and the group's servers", async () => {
    const { code, stdout } = await run(["sg", "inspect", "default", "--json"]);
    expect(code).toBe(0);
    const { profile, project, securityGroup } = JSON.parse(stdout);
    expect(profile).toBe("prod");
    expect(project.name).toBe("Alpha");
    expect(securityGroup).toMatchObject({
      description: "Default security group",
      id: "ssss1111-0000-4000-8000-000000000001",
      name: "default",
      servers: [
        {
          addresses: ["192.0.2.5", "2001:db8::5"],
          id: "22222222-2222-4222-8222-222222222222",
          name: "web-1",
        },
        {
          addresses: ["198.51.100.4"],
          id: "11111111-1111-4111-8111-111111111111",
          name: "db-1",
        },
      ],
    });
    expect(securityGroup.rules[0]).toEqual({
      direction: "ingress",
      ethertype: "IPv4",
      exposed: false,
      id: "r1",
      portMax: null,
      portMin: null,
      protocol: "any",
      remoteGroupId: "ssss1111-0000-4000-8000-000000000001",
      remoteGroupName: "default",
      remoteIpPrefix: null,
    });
  });

  test("--json marks the exposed rules, and keeps a server whose port has no address", async () => {
    const { code, stdout } = await run(["sg", "inspect", "web", "--json"]);
    expect(code).toBe(0);
    const { securityGroup } = JSON.parse(stdout);
    expect(securityGroup.servers[0]).toEqual({
      addresses: [],
      id: "33333333-3333-4333-8333-333333333333",
      name: "web-2",
    });
    expect(
      securityGroup.rules.map((rule: { id: string; exposed: boolean }) => [
        rule.id,
        rule.exposed,
      ])
    ).toEqual([
      ["r4", false],
      ["r5", true],
    ]);
  });

  test("prints the rules on stderr, and the ID to a pipe", async () => {
    const id = "ssss1111-0000-4000-8000-000000000001";
    const { code, stderr, stdout } = await run(["sg", "inspect", id]);
    expect(code).toBe(0);
    expect(stderr).toMatch(
      /> Security group default in Alpha \[\d+(?:ms|s)\]/u
    );
    expect(stderr).toMatch(/Description\s+Default security group\n/u);
    expect(stderr).toMatch(
      /Servers\s+web-1 \(192\.0\.2\.5, 2001:db8::5\)\n\s+db-1 \(198\.51\.100\.4\)\n/u
    );
    expect(stderr).toMatch(/Created\s+30d ago/u);
    expect(stderr).toMatch(
      /> Inbound rules\n\n\s+Protocol\s+Ports\s+Source\s+Ethertype\n\s+any\s+any\s+group default\s+IPv4\n/u
    );
    expect(stderr).toMatch(
      /> Outbound rules\n\n\s+Protocol\s+Ports\s+Destination\s+Ethertype\n\s+any\s+any\s+any\s+IPv4\n\s+any\s+any\s+any\s+IPv6\n/u
    );
    expect(stderr).not.toContain("open to the internet");
    expect(stdout).toBe(`${id}\n`);
  });

  test("a group without outbound rules says so, and only servers count", async () => {
    const { code, stderr } = await run(["sg", "inspect", "web"]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/Description\s+-\n/u);
    expect(stderr).toMatch(
      /Servers\s+web-2 \(-\)\n\s+web-1 \(192\.0\.2\.5, 2001:db8::5\)\n\s+Created/u
    );
    expect(stderr).toMatch(/\n! tcp {10}22 {8}0\.0\.0\.0\/0 {5}IPv4\n/u);
    expect(stderr).toMatch(/\n {2}tcp {10}443 {7}0\.0\.0\.0\/0 {5}IPv4\n/u);
    expect(stderr).toContain("> NOTE: SSH (22) is open to the internet.");
    expect(stderr).toContain(
      "> No outbound rules, so this group lets no traffic out."
    );
    expect(stderr).not.toContain("Outbound rules\n");
  });

  test("an unknown group points to sg ls", async () => {
    const { code, stderr, stdout } = await run(["sg", "inspect", "nope"]);
    expect(code).toBe(1);
    expect(stderr).toContain(
      'no security group named or with ID "nope" in Alpha'
    );
    expect(stderr).toContain("Run `nipa sg ls` to see your security groups.");
    expect(stdout).toBe("");
  });

  test("a missing group argument exits 2", async () => {
    const { code, stderr } = await run(["sg", "inspect"]);
    expect(code).toBe(2);
    expect(stderr).toContain("missing <group>");
  });
});

describe("k8s ls", () => {
  beforeAll(async () => {
    await freshDir();
    await seedSession(dir, keystone.url);
  });

  test("--json lists the project's clusters with their nodes", async () => {
    const { code, stdout } = await run(["k8s", "ls", "--json"]);
    expect(code).toBe(0);
    const { clusters, profile, project } = JSON.parse(stdout);
    expect(profile).toBe("prod");
    expect(project.name).toBe("Alpha");
    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toMatchObject({
      id: "dddd1111-0000-4000-8000-000000000001",
      nodes: [
        { name: "k8s-control-plane-1", role: "master", status: "ACTIVE" },
        { name: "k8s-worker-1", role: "worker", status: "ERROR" },
      ],
      version: "1.34.9",
    });
  });

  test("prints a table on stderr and one cluster ID per line to a pipe", async () => {
    const { code, stderr, stdout } = await run(["coe"]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/> Kubernetes clusters in Alpha \[\d+(?:ms|s)\]/u);
    expect(stderr).toMatch(/Cluster\s+Version\s+Nodes\s+Active\s+Age/u);
    expect(stderr).toMatch(
      /dddd1111-0000-4000-8000-000000000001\s+1\.34\.9\s+1 master, 1 worker\s+1 of 2\s+61d/u
    );
    expect(stderr).toMatch(
      /dddd2222-0000-4000-8000-000000000002\s+-\s+1 node\s+0 of 1\s+90d/u
    );
    expect(stdout.trim().split("\n")).toEqual([
      "dddd1111-0000-4000-8000-000000000001",
      "dddd2222-0000-4000-8000-000000000002",
    ]);
  });

  test("a project without clusters says so", async () => {
    await run(["switch", "Beta"]);
    const { code, stderr, stdout } = await run(["kubernetes", "ls"]);
    expect(code).toBe(0);
    expect(stderr).toContain("No Kubernetes clusters in Beta");
    expect(stdout).toBe("");
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

describe("db inspect", () => {
  beforeAll(async () => {
    await freshDir();
    await seedSession(dir, keystone.url);
  });

  test("--json prints the database with its replicas, logs, backups and problems", async () => {
    const { code, stdout } = await run(["db", "inspect", "orders", "--json"]);
    expect(code).toBe(0);
    const { database, profile, project } = JSON.parse(stdout);
    expect(profile).toBe("prod");
    expect(project.name).toBe("Alpha");
    expect(database).toMatchObject({
      id: FAKE_DATABASES[0]?.id,
      name: "orders",
      primary: {
        allowedCidrs: ["203.0.113.0/24", "198.51.100.7/32"],
        port: 3306,
      },
      problems: [],
      replicas: [{ name: "orders-replica-1", status: "ACTIVE" }],
    });
    expect(database.logs.map((l: { name: string }) => l.name)).toEqual([
      "general",
      "slow_query",
    ]);
    expect(database.backups).toHaveLength(6);
  });

  test("prints the details and a verdict on stderr, and the ID to a pipe", async () => {
    const { code, stderr, stdout } = await run(["db", "inspect", "orders"]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/> Database orders in Alpha \[\d+(?:ms|s)\]/u);
    expect(stderr).toMatch(/Engine\s+mysql 8\.0\.34\n/u);
    expect(stderr).toMatch(/Health\s+● Healthy \(checked 2h ago\)\n/u);
    expect(stderr).toMatch(/Flavor\s+dsa\.large\.v1 \(2 vCPUs, 4 GB RAM\)/u);
    expect(stderr).toMatch(
      /Address\s+203\.0\.113\.20:3306 \(external\)\n\s+192\.0\.2\.20:3306\n/u
    );
    expect(stderr).toMatch(
      /Allowed CIDRs\s+203\.0\.113\.0\/24\n\s+198\.51\.100\.7\/32\n/u
    );
    expect(stderr).toMatch(
      /Replicas\s+● Active {2}orders-replica-1 \(192\.0\.2\.22\)\n/u
    );
    expect(stderr).toMatch(
      /Logs\s+General \(disabled\)\n\s+Slow query \(published, 2 MB\)\n/u
    );
    expect(stderr).toMatch(
      /Backups\s+● Completed {2}orders-nightly-6 \(0\.19 GB, 1d ago\)\n/u
    );
    expect(stderr).toContain("orders-nightly-2 (0.19 GB, 5d ago)");
    expect(stderr).not.toContain("orders-nightly-1 ");
    expect(stderr).toContain("and 1 more in --json");
    expect(stderr).toContain(
      "> orders is healthy. Connect to it at 203.0.113.20:3306."
    );
    expect(stdout).toBe(`${FAKE_DATABASES[0]?.id}\n`);
  });

  test("a database that isn't healthy says what's wrong, and a building replica has no address", async () => {
    const { code, stderr } = await run(["db", "inspect", "analytics"]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/Health\s+● Unknown\n/u);
    expect(stderr).toMatch(/Address\s+192\.0\.2\.21:5432\n/u);
    expect(stderr).toMatch(/Allowed CIDRs\s+None set\n/u);
    expect(stderr).toMatch(/Replicas\s+● Build {2}analytics-replica-1\n/u);
    expect(stderr).toMatch(/Backups\s+None\n/u);
    expect(stderr).toContain(
      "> NOTE: analytics needs attention: the primary's status is Build, the primary's health is Unknown and analytics-replica-1's status is Build."
    );
    expect(stderr).not.toContain("is healthy");
    const { stdout } = await run(["db", "inspect", "analytics", "--json"]);
    const { database } = JSON.parse(stdout);
    expect(database.replicas).toEqual([
      {
        address: null,
        health: "UNKNOWN",
        id: "eeee2222-0000-4000-8000-000000000003",
        name: "analytics-replica-1",
        status: "BUILD",
      },
    ]);
    expect(database.problems).toEqual([
      { field: "status", name: null, part: "primary", value: "BUILD" },
      { field: "health", name: null, part: "primary", value: "UNKNOWN" },
      {
        field: "status",
        name: "analytics-replica-1",
        part: "replica",
        value: "BUILD",
      },
    ]);
  });

  describe.each([
    ["replicas", "/api/v4/databases", /Replicas\s+Unavailable\n/u],
    [
      "logs",
      `/api/v4/database/${FAKE_DATABASES[0]?.primary?.id}/logs`,
      /Logs\s+Unavailable\n/u,
    ],
    ["backups", "/api/v4/database/backups", /Backups\s+Unavailable\n/u],
  ])("when the Space API fails for the %s", (part, pathname, line) => {
    beforeAll(() => {
      keystone.faults.set(`GET ${pathname}`, 500);
    });

    afterAll(() => {
      keystone.faults.delete(`GET ${pathname}`);
    });

    test("still prints the database, and the verdict covers what loaded", async () => {
      const { code, stderr, stdout } = await run(["db", "inspect", "orders"]);
      expect(code).toBe(0);
      expect(stderr).toMatch(/Engine\s+mysql 8\.0\.34\n/u);
      expect(stderr).toMatch(line);
      expect(stderr).toContain(
        `> NOTE: The Space API didn't answer for the ${part} of orders, so the verdict leaves them out.`
      );
      expect(stderr).toContain(
        "> orders is healthy. Connect to it at 203.0.113.20:3306."
      );
      expect(stdout).toBe(`${FAKE_DATABASES[0]?.id}\n`);
    });

    test(`--json has null for the ${part}`, async () => {
      const { code, stdout } = await run(["db", "inspect", "orders", "--json"]);
      expect(code).toBe(0);
      const { database } = JSON.parse(stdout);
      expect(database[part]).toBeNull();
      expect(database.problems).toEqual([]);
      const others = ["replicas", "logs", "backups"].filter((p) => p !== part);
      for (const other of others) {
        expect(Array.isArray(database[other])).toBe(true);
      }
    });
  });

  test("a cluster without a primary yet", async () => {
    const { code, stderr } = await run(["db", "inspect", "cache"]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/Status\s+-\n/u);
    expect(stderr).not.toContain("Engine");
    expect(stderr).toContain(
      "> NOTE: cache needs attention: the cluster has no primary yet."
    );
  });

  test("an unknown database points to db ls", async () => {
    const { code, stderr, stdout } = await run(["db", "inspect", "nope"]);
    expect(code).toBe(1);
    expect(stderr).toContain('no database named or with ID "nope" in Alpha');
    expect(stderr).toContain("Run `nipa db ls` to see your databases.");
    expect(stdout).toBe("");
  });

  test("a missing database argument exits 2", async () => {
    const { code } = await run(["db", "inspect"]);
    expect(code).toBe(2);
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

describe("open", () => {
  test("prints the portal's project page to a pipe, without a session", async () => {
    await freshDir();
    const { code, stderr, stdout } = await run(["open"]);
    expect(code).toBe(0);
    expect(stdout).toBe("https://space.nipa.cloud/project\n");
    expect(stderr).toBe("");
  });

  test("a named resource needs a session", async () => {
    const { code, stderr, stdout } = await run(["open", "server", "web-1"]);
    expect(code).toBe(1);
    expect(stderr).toContain("aren't logged in to prod");
    expect(stdout).toBe("");
  });

  describe("with a session", () => {
    beforeAll(async () => {
      await freshDir();
      await seedSession(dir, keystone.url);
    });

    test.each([
      [["server"], "/compute_instances"],
      [["sg"], "/security_group"],
      [
        ["server", "web-1"],
        "/compute_instances/22222222-2222-4222-8222-222222222222/overview",
      ],
      [
        ["lb", "web-lb"],
        "/load_balancers/bbbb1111-0000-4000-8000-000000000001/details",
      ],
      [
        ["db", "orders"],
        "/sql_databases/aaaa1111-0000-4000-8000-000000000001/overview",
      ],
      [
        ["network", "default"],
        "/networks/nnnn1111-0000-4000-8000-000000000001",
      ],
      [["sg", "web"], "/security_group/ssss2222-0000-4000-8000-000000000002"],
      [["volume", "web-1-vol-0"], "/volumes?search=web-1-vol-0"],
      [
        ["volume", "vvvv3333-0000-4000-8000-000000000003"],
        "/volumes?search=vvvv3333-0000-4000-8000-000000000003",
      ],
    ])("nipa open %p prints %s", async (words, page) => {
      const { code, stdout } = await run(["open", ...words, "--url"]);
      expect(code).toBe(0);
      expect(stdout).toBe(`${keystone.url}${page}\n`);
    });

    test("an unknown load balancer points to lb ls", async () => {
      const { code, stderr, stdout } = await run(["open", "lb", "nope"]);
      expect(code).toBe(1);
      expect(stderr).toContain(
        'no load balancer named or with ID "nope" in Alpha'
      );
      expect(stderr).toContain("Run `nipa lb ls` to see your load balancers.");
      expect(stdout).toBe("");
    });

    test("an unknown kind of resource exits 2 and lists the kinds", async () => {
      const { code, stderr } = await run(["open", "k8s"]);
      expect(code).toBe(2);
      expect(stderr).toContain('unknown resource "k8s"');
      expect(stderr).toContain("server, volume, network, sg, lb, db");
    });
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

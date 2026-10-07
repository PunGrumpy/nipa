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
    expect(script).toContain("'db:List the databases in your project'");
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
        unlimited: false,
        used: 10,
      },
      {
        group: "compute",
        limit: 20,
        name: "cores",
        unit: null,
        unlimited: false,
        used: 18,
      },
      {
        group: "compute",
        limit: 51_200,
        name: "ram",
        unit: "MB",
        unlimited: false,
        used: 45_056,
      },
      {
        group: "network",
        limit: null,
        name: "port",
        unit: null,
        unlimited: true,
        used: 11,
      },
      {
        group: "objectStorage",
        limit: null,
        name: "storage_size",
        unit: "Bytes",
        unlimited: true,
        used: 1_755_585,
      },
      {
        group: "fileStorage",
        limit: 5,
        name: "shares",
        unit: null,
        unlimited: false,
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
      ],
    });
  });

  test("prints a table on stderr and one ID per line to a pipe", async () => {
    const { code, stderr, stdout } = await run(["security-groups"]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/> Security groups in Alpha \[\d+(?:ms|s)\]/u);
    expect(stderr).toMatch(/Name\s+Inbound\s+Outbound\s+Age\s+Description/u);
    expect(stderr).toMatch(/web\s+1\s+0\s+2d\s+-/u);
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

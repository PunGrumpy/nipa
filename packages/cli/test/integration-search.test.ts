// Runs `nipa server search` as a process against a fake Keystone that has
// several projects, each with its own servers.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  ENTRY,
  runOnTerminals,
  runProcess,
  seedSession,
  testEnv,
} from "./helpers";
import {
  ALPHA_ID,
  BETA_ID,
  startFakeKeystone,
  TWIN_BETA_ID,
} from "./mocks/keystone";
import type { FakeKeystone } from "./mocks/keystone";
import { fakeInstance } from "./mocks/space";

const CHARLIE = { id: "3".repeat(32), name: "Charlie" };
const DELTA = { id: "4".repeat(32), name: "Delta" };
const SPACED = { id: "7".repeat(32), name: "My Project" };
const FINANCE = { id: "5".repeat(32), name: "Finance" };
const OLD_TEAM = { id: "6".repeat(32), name: "Old-Team" };

const WEB_2 = "33333333-3333-4333-8333-333333333333";
const WEB_1_ACTIVE = "22222222-2222-4222-8222-222222222222";
const WEB_1_SHUTOFF = "77777777-7777-4777-8777-777777777777";
const BETA_WEB_1 = "bbbb1111-0000-4000-8000-000000000001";
const BETA_WORKER = "bbbb2222-0000-4000-8000-000000000002";
const NODE = "dddd1111-0000-4000-8000-000000000001";
const TWIN_WEB = "dddd2222-0000-4000-8000-000000000002";

const servers = {
  // Alpha has two servers named web-1, so the name can't pick one.
  [ALPHA_ID]: [
    fakeInstance("web-2", WEB_2, "192.0.2.7", { status: "BUILD" }),
    fakeInstance("web-1", WEB_1_ACTIVE, "192.0.2.5", {
      external_ips: [{ address: "203.0.113.10" }],
    }),
    fakeInstance(
      "db-1",
      "11111111-1111-4111-8111-111111111111",
      "198.51.100.4",
      {
        status: "SHUTOFF",
      }
    ),
    fakeInstance("web-1", WEB_1_SHUTOFF, "192.0.2.77", { status: "SHUTOFF" }),
  ],
  [BETA_ID]: [
    fakeInstance("web-1", BETA_WEB_1, "198.51.100.5"),
    fakeInstance("worker", BETA_WORKER, "198.51.100.6"),
  ],
  [CHARLIE.id]: [],
  [DELTA.id]: [
    fakeInstance("k8s-web-node-0", NODE, "203.0.113.41", {
      metadata: {
        kube_version: "1.34.9",
        magnum_cluster_id: "dddd0000-0000-4000-8000-000000000009",
        magnum_role: "worker",
      },
    }),
  ],
  [SPACED.id]: [
    fakeInstance(
      "batch",
      "eeee1111-0000-4000-8000-000000000001",
      "203.0.113.51"
    ),
  ],
};

let good: FakeKeystone;
let faulty: FakeKeystone;
let twins: FakeKeystone;
let dir: string;
let faultyDir: string;
let twinsDir: string;

const seed = async (keystone: FakeKeystone): Promise<string> => {
  const folder = await mkdtemp(path.join(tmpdir(), "nipa-search-"));
  await seedSession(folder, keystone.url);
  return folder;
};

const run = (args: string[], folder = dir, cwd?: string) =>
  runProcess(["bun", ENTRY, ...args], testEnv(folder), cwd);

const onTerminal = (args: string[], columns: number, folder = dir) =>
  runOnTerminals({
    args,
    env: { ...testEnv(folder), NIPA_TEST_STDERR_COLUMNS: String(columns) },
    terminals: ["stdout", "stderr"],
  });

const document = (result: { stderr: string }) =>
  JSON.parse(result.stderr.trimEnd().split("\n").at(-1) ?? "");

const filesUnder = async (current: string): Promise<string[]> => {
  const entries = await readdir(current, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(current, entry.name);
      return entry.isDirectory() ? filesUnder(full) : [full];
    })
  );
  return nested.flat();
};

/** Every file under the folder, by relative path, with its text. */
const treeOf = async (folder: string): Promise<Record<string, string>> => {
  const files = await filesUnder(folder);
  const entries = await Promise.all(
    files.map(async (file): Promise<[string, string]> => [
      path.relative(folder, file),
      await readFile(file, "utf-8"),
    ])
  );
  return Object.fromEntries(entries);
};

beforeAll(async () => {
  good = startFakeKeystone({
    extraProjects: [CHARLIE, DELTA, SPACED],
    gateway: true,
    projects: { latencyMs: 40, servers },
  });
  faulty = startFakeKeystone({
    extraProjects: [CHARLIE, DELTA, FINANCE, OLD_TEAM],
    gateway: true,
    projects: { fail: { [FINANCE.id]: 403 }, servers },
    refuse: [OLD_TEAM.id],
  });
  // Two enabled projects are both named Beta.
  twins = startFakeKeystone({
    gateway: true,
    projects: {
      servers: {
        [BETA_ID]: [fakeInstance("web-1", BETA_WEB_1, "198.51.100.5")],
        [TWIN_BETA_ID]: [fakeInstance("web-9", TWIN_WEB, "198.51.100.9")],
      },
    },
    twinBeta: true,
  });
  dir = await seed(good);
  faultyDir = await seed(faulty);
  twinsDir = await seed(twins);
});

afterAll(async () => {
  good.stop();
  faulty.stop();
  twins.stop();
  await rm(twinsDir, { force: true, recursive: true });
  await rm(dir, { force: true, recursive: true });
  await rm(faultyDir, { force: true, recursive: true });
});

describe("server search in a terminal", () => {
  test("groups the matches by project at 80 columns, marks the current project and shows an ID only under a repeated name", async () => {
    const { code, stderr, stdout } = await onTerminal(
      ["server", "search", "web"],
      80
    );
    expect(code).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toMatch(
      /^> 5 servers match "web" in 5 projects \[\d+(?:ms|s)\]\n/u
    );
    expect(stderr).toContain(
      [
        "  Alpha (current)",
        "    web-2                                ● Build     192.0.2.7",
        "    web-1                                ● Active    203.0.113.10",
        `      ID ${WEB_1_ACTIVE}`,
        "    web-1                                ● Shutoff   192.0.2.77",
        `      ID ${WEB_1_SHUTOFF}`,
        "",
        "  Beta",
        "    web-1                                ● Active    198.51.100.5",
        "",
        "  Delta",
        "    k8s-web-node-0 (Kubernetes worker)   ● Active    203.0.113.41",
        "",
      ].join("\n")
    );
    // A project with no match has no heading, and Beta's web-1 has no ID line.
    expect(stderr).not.toContain("Charlie");
    expect(stderr).not.toContain(BETA_WEB_1);
    expect(stderr).toContain(
      "> Act on one with `nipa -p <project> server <verb> <name or ID>`."
    );
  });

  test("a narrow terminal prints two lines per server and cuts nothing", async () => {
    const { stderr } = await onTerminal(["server", "search", "web"], 40);
    expect(stderr).toContain(
      ["    web-2", "      ● Build   192.0.2.7"].join("\n")
    );
    expect(stderr).toContain(
      ["    k8s-web-node-0 (worker)", "      ● Active   203.0.113.41"].join(
        "\n"
      )
    );
    expect(stderr).toContain(`      ID ${WEB_1_SHUTOFF}`);
  });

  test("one match prints the exact command to inspect it, in its project", async () => {
    const { code, stderr } = await onTerminal(
      ["server", "search", "worker"],
      80
    );
    expect(code).toBe(0);
    expect(stderr).toContain('> 1 server matches "worker" in 5 projects');
    expect(stderr).toContain(
      "> Run `nipa -p Beta server inspect worker` to see its details.\n"
    );
    expect(stderr).not.toContain("Act on one");
  });

  test("a single match whose name the project repeats is named by its ID", async () => {
    const { stderr } = await onTerminal(["server", "search", "192.0.2.77"], 80);
    expect(stderr).toContain(
      `> Run \`nipa -p Alpha server inspect ${WEB_1_SHUTOFF}\` to see its details.\n`
    );
  });

  test("a project name with a space is quoted for the shell", async () => {
    const { stderr } = await onTerminal(["server", "search", "batch"], 80);
    expect(stderr).toContain(
      "> Run `nipa -p 'My Project' server inspect batch` to see its details.\n"
    );
  });

  test("no matches says what it looked for, and exits 0", async () => {
    const { code, stderr, stdout } = await onTerminal(
      ["server", "search", "zzz"],
      80
    );
    expect(code).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toMatch(
      /^> No servers match "zzz" in 5 projects\. \[\d+(?:ms|s)\]\n$/u
    );
  });

  test("without a query it lists every server in every project", async () => {
    const { code, stderr } = await onTerminal(["server", "search"], 120);
    expect(code).toBe(0);
    expect(stderr).toMatch(/^> 8 servers in 5 projects/u);
    expect(stderr).not.toContain("  Charlie");
    for (const name of ["Alpha", "Beta", "Delta", "My Project"]) {
      expect(stderr).toContain(`  ${name}`);
    }
  });

  test("finds a server by a piece of its ID or address, in any case", async () => {
    const byId = await onTerminal(["server", "search", "BBBB2222"], 80);
    expect(byId.stderr).toContain('> 1 server matches "BBBB2222"');
    const byAddress = await onTerminal(["server", "search", "100.6"], 80);
    expect(byAddress.stderr).toContain("worker");
    const literal = await onTerminal(["server", "search", "198x51"], 80);
    expect(literal.stderr).toContain('No servers match "198x51"');
  });
});

describe("server search with two projects of the same name", () => {
  test("a terminal shows each one's ID after its name", async () => {
    const { stderr } = await onTerminal(
      ["server", "search", "web"],
      80,
      twinsDir
    );
    expect(stderr).toContain(`  Beta ${BETA_ID}\n    web-1`);
    expect(stderr).toContain(`  Beta ${TWIN_BETA_ID}\n    web-9`);
    expect(stderr).not.toContain(`  Alpha ${ALPHA_ID}`);
  });

  test("a pipe names the project's ID in its own column", async () => {
    const { stdout } = await run(["server", "search", "web"], twinsDir);
    const rows = stdout
      .trimEnd()
      .split("\n")
      .slice(1)
      .map((line) => line.split("\t"))
      .filter((row) => row[2] === "Beta");
    expect(rows.map((row) => row.slice(1, 4))).toEqual([
      ["web-1", "Beta", BETA_ID],
      ["web-9", "Beta", TWIN_BETA_ID],
    ]);
  });
});

describe("server search in a pipe", () => {
  test("stdout is a tab-separated table and stderr is only the context line", async () => {
    const { code, stderr, stdout } = await run(["server", "search", "web"]);
    expect(code).toBe(0);
    expect(stderr).toMatch(
      /^> 5 servers match "web" in 5 projects \[\d+(?:ms|s)\]\n$/u
    );
    const lines = stdout.trimEnd().split("\n");
    expect(lines[0]).toBe(
      "ID\tName\tProject\tProject ID\tStatus\tAddress\tFlavor\tCreated"
    );
    const rows = lines.slice(1).map((line) => line.split("\t"));
    expect(rows.map((row) => row.length)).toEqual(rows.map(() => 8));
    expect(rows.map((row) => row.slice(0, 6))).toEqual([
      [WEB_2, "web-2", "Alpha", ALPHA_ID, "Build", "192.0.2.7"],
      [WEB_1_ACTIVE, "web-1", "Alpha", ALPHA_ID, "Active", "203.0.113.10"],
      [WEB_1_SHUTOFF, "web-1", "Alpha", ALPHA_ID, "Shutoff", "192.0.2.77"],
      [BETA_WEB_1, "web-1", "Beta", BETA_ID, "Active", "198.51.100.5"],
      [NODE, "k8s-web-node-0", "Delta", DELTA.id, "Active", "203.0.113.41"],
    ]);
    expect(rows[0]?.[7]).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u);
    expect(stdout).not.toContain("●");
    expect(stdout).not.toContain("Kubernetes");
  });

  test("grep -i active keeps only the active rows", async () => {
    const { stdout } = await run(["server", "search", "web"]);
    const kept = stdout
      .trimEnd()
      .split("\n")
      .slice(1)
      .filter((line) => /active/iu.test(line));
    expect(kept.map((line) => line.split("\t")[0])).toEqual([
      WEB_1_ACTIVE,
      BETA_WEB_1,
      NODE,
    ]);
    for (const line of kept) {
      expect(line.split("\t")[4]).toBe("Active");
    }
  });

  test("cut -f1 gives the IDs, and no matches leaves the header alone", async () => {
    const none = await run(["server", "search", "zzz"]);
    expect(none.code).toBe(0);
    expect(none.stdout).toBe(
      "ID\tName\tProject\tProject ID\tStatus\tAddress\tFlavor\tCreated\n"
    );
    expect(none.stderr).toMatch(/^> No servers match "zzz" in 5 projects\./u);
  });
});

describe("server search --json", () => {
  test("prints one document with the matches and the projects, and nothing on stderr", async () => {
    const { code, stderr, stdout } = await run([
      "server",
      "search",
      "web",
      "--json",
    ]);
    expect(code).toBe(0);
    expect(stderr).toBe("");
    const body = JSON.parse(stdout);
    expect(body).toMatchObject({
      failed: [],
      profile: "prod",
      projects: { searched: 5, total: 5 },
      query: "web",
    });
    expect(body).not.toHaveProperty("searched");
    expect(body).not.toHaveProperty("total");
    expect(body.servers.map((s: { id: string }) => s.id)).toEqual([
      WEB_2,
      WEB_1_ACTIVE,
      WEB_1_SHUTOFF,
      BETA_WEB_1,
      NODE,
    ]);
    expect(body.servers[0]).toMatchObject({
      addresses: [{ address: "192.0.2.7", type: "fixed", version: 4 }],
      flavor: "csa.large.v2",
      name: "web-2",
      project: { id: ALPHA_ID, name: "Alpha" },
      status: "BUILD",
    });
    expect(body.servers[4].kubernetes).toMatchObject({ role: "worker" });
  });

  test("a search with no query has a null query, and no match is an empty list", async () => {
    const everything = await run(["server", "search", "--json"]);
    const all = JSON.parse(everything.stdout);
    expect(all.query).toBeNull();
    expect(all.servers).toHaveLength(8);
    const none = await run(["server", "search", "zzz", "--json"]);
    expect(none.code).toBe(0);
    expect(JSON.parse(none.stdout).servers).toEqual([]);
  });
});

describe("server search when a project fails", () => {
  test("a terminal gets the matches, then the error that lists the projects", async () => {
    const { code, stderr, stdout } = await onTerminal(
      ["server", "search", "web"],
      80,
      faultyDir
    );
    expect(code).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toMatch(
      /^> 5 servers match "web" in 4 of 6 projects \[\d+(?:ms|s)\]\n/u
    );
    expect(stderr).toContain("  Alpha (current)");
    expect(
      stderr.endsWith(
        [
          "Error: Searched 4 of 6 projects. 2 failed.",
          "  Finance: You are not allowed to list servers",
          "  Old-Team: Keystone refused the project",
          "> Try one again with `nipa -p Finance server ls`.",
          "",
        ].join("\n")
      )
    ).toBe(true);
  });

  test("a pipe still gets the rows on stdout, with the error on stderr", async () => {
    const { code, stderr, stdout } = await run(
      ["server", "search", "web"],
      faultyDir
    );
    expect(code).toBe(1);
    expect(stdout.trimEnd().split("\n")).toHaveLength(6);
    expect(stderr).toContain("Error: Searched 4 of 6 projects. 2 failed.");
    expect(stderr).toContain('> 5 servers match "web" in 4 of 6 projects');
  });

  test("--json prints its document, exits 1 and writes no error document", async () => {
    const { code, stderr, stdout } = await run(
      ["server", "search", "web", "--json"],
      faultyDir
    );
    expect(code).toBe(1);
    expect(stderr).toBe("");
    const body = JSON.parse(stdout);
    expect(body.projects).toEqual({ searched: 4, total: 6 });
    expect(body).not.toHaveProperty("searched");
    expect(body).not.toHaveProperty("total");
    expect(body.servers).toHaveLength(5);
    expect(body.failed).toEqual([
      {
        message: "You are not allowed to list servers",
        project: { domainId: "d1", id: FINANCE.id, name: "Finance" },
        reason: "api_error",
        status: 403,
      },
      {
        message: "Keystone refused the project",
        project: { domainId: "d1", id: OLD_TEAM.id, name: "Old-Team" },
        reason: "api_error",
        status: 401,
      },
    ]);
  });

  test("no matches with a failure says how many projects it searched, never all of them", async () => {
    const { code, stderr } = await onTerminal(
      ["server", "search", "zzz"],
      80,
      faultyDir
    );
    expect(code).toBe(1);
    expect(stderr).toContain('> No servers match "zzz" in 4 of 6 projects.');
    expect(stderr).not.toContain("in 6 projects");
    expect(stderr).not.toContain("in 4 projects");
  });

  test("a run under -P keeps -P in the command it suggests", async () => {
    const config = JSON.parse(
      await readFile(path.join(faultyDir, "config.json"), "utf-8")
    );
    const auth = JSON.parse(
      await readFile(path.join(faultyDir, "auth.json"), "utf-8")
    );
    config.profiles.staging = config.profiles.prod;
    auth.sessions.staging = auth.sessions.prod;
    await writeFile(
      path.join(faultyDir, "config.json"),
      JSON.stringify(config)
    );
    await writeFile(path.join(faultyDir, "auth.json"), JSON.stringify(auth));
    const { code, stderr } = await onTerminal(
      ["-P", "staging", "server", "search", "web"],
      80,
      faultyDir
    );
    expect(code).toBe(1);
    expect(stderr).toContain(
      "> Try one again with `nipa -P staging -p Finance server ls`."
    );
    expect(stderr).toContain(
      "> Act on one with `nipa -P staging -p <project> server <verb> <name or ID>`."
    );
    const one = await onTerminal(
      ["-P", "staging", "server", "search", "100.6"],
      80,
      faultyDir
    );
    expect(one.stderr).toContain(
      "> Run `nipa -P staging -p Beta server inspect worker` to see its details."
    );
  });

  test("every project failing the same way is one error, not a list", async () => {
    const stale = await seed(good);
    try {
      const auth = JSON.parse(
        await readFile(path.join(stale, "auth.json"), "utf-8")
      );
      await fetch(`${good.url}/v3/auth/tokens`, {
        headers: {
          "X-Auth-Token": auth.sessions.prod.token,
          "X-Subject-Token": auth.sessions.prod.token,
        },
        method: "DELETE",
      });
      const human = await run(["server", "search", "web"], stale);
      expect(human.code).toBe(1);
      expect(human.stderr).toBe(
        "Error: your prod session expired or was revoked\n> Run `nipa login`.\n"
      );
      const json = await run(["server", "search", "web", "--json"], stale);
      expect(json.code).toBe(1);
      expect(json.stdout).toBe("");
      expect(document(json)).toMatchObject({
        next: [{ argv: ["nipa", "login"], command: "nipa login" }],
        reason: "token_expired",
        status: "action_required",
      });
    } finally {
      await rm(stale, { force: true, recursive: true });
    }
  });

  test("a failure of the one project -p names is an ordinary error", async () => {
    const { code, stderr, stdout } = await run(
      ["-p", "Finance", "server", "search", "web"],
      faultyDir
    );
    expect(code).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("Error: You are not allowed to list servers");
    expect(stderr).not.toContain("Searched");
  });
});

describe("server search with -p", () => {
  test("searches only that project, with no exchange for the others", async () => {
    const before = good.requests.length;
    const { code, stderr } = await onTerminal(
      ["-p", "Beta", "server", "search", "web"],
      80
    );
    expect(code).toBe(0);
    const sent = good.requests.slice(before);
    expect(sent.filter((r) => r === "GET /api/v3/instances")).toHaveLength(1);
    expect(sent.filter((r) => r === "POST /v3/auth/tokens")).toHaveLength(1);
    expect(stderr).toContain("> Using project Beta\n");
    expect(stderr).toMatch(
      /> 1 server matches "web" in Beta \[\d+(?:ms|s)\]\n/u
    );
    expect(stderr).toContain(
      ["  Beta", "    web-1   ● Active   198.51.100.5", ""].join("\n")
    );
    expect(stderr).toContain(
      "> Run `nipa -p Beta server inspect web-1` to see its details.\n"
    );
    expect(stderr).not.toContain("Alpha");
  });

  test("several matches in the one project point to the command without a project", async () => {
    const { stderr } = await onTerminal(
      ["-p", "Alpha", "server", "search", "web"],
      80
    );
    expect(stderr).toContain(
      "> Act on one with `nipa -p Alpha server <verb> <name or ID>`."
    );
  });

  test("a -p after the command works the same, and --json names the one project", async () => {
    const { code, stdout } = await run([
      "server",
      "search",
      "web",
      "-p",
      "Beta",
      "--json",
    ]);
    expect(code).toBe(0);
    const body = JSON.parse(stdout);
    expect(body.projects).toEqual({ searched: 1, total: 1 });
    expect(
      body.servers.map((s: { project: { name: string } }) => s.project.name)
    ).toEqual(["Beta"]);
  });

  test("an unknown project fails without searching any other", async () => {
    const before = good.requests.length;
    const { code, stderr } = await run([
      "-p",
      "Nope",
      "server",
      "search",
      "web",
    ]);
    expect(code).toBe(1);
    expect(stderr).toContain('no project named or with ID "Nope"');
    expect(
      good.requests.slice(before).filter((r) => r === "GET /api/v3/instances")
    ).toHaveLength(0);
  });
});

describe("server search in a linked folder", () => {
  test("the link does not narrow it, and nothing is saved", async () => {
    const folder = await seed(good);
    const work = path.join(folder, "infra");
    try {
      await mkdir(work, { recursive: true });
      const linked = await run(["link", "Beta"], folder, work);
      expect(linked.code).toBe(0);
      const before = await treeOf(folder);
      const plain = await run(["server", "ls", "--json"], folder, work);
      expect(JSON.parse(plain.stdout).project.name).toBe("Beta");
      const { code, stderr, stdout } = await run(
        ["server", "search", "web", "--json"],
        folder,
        work
      );
      expect(code).toBe(0);
      expect(stderr).toBe("");
      const body = JSON.parse(stdout);
      expect(body.projects.total).toBe(5);
      expect(
        new Set(
          body.servers.map((s: { project: { name: string } }) => s.project.name)
        )
      ).toEqual(new Set(["Alpha", "Beta", "Delta"]));
      expect(await treeOf(folder)).toEqual(before);
      const terminal = await runOnTerminals({
        args: ["server", "search", "web"],
        env: testEnv(folder),
        terminals: ["stdout", "stderr"],
      });
      expect(terminal.stderr).not.toContain("project.json");
      expect(terminal.stderr).not.toContain("Using project");
      // The saved project, not the folder's, is the current one.
      expect(terminal.stderr).toContain("  Alpha (current)");
    } finally {
      await rm(folder, { force: true, recursive: true });
    }
  });

  test("-p still beats the link", async () => {
    const folder = await seed(good);
    const work = path.join(folder, "infra");
    try {
      await mkdir(work, { recursive: true });
      await run(["link", "Beta"], folder, work);
      const { stdout } = await run(
        ["-p", "Alpha", "server", "search", "web", "--json"],
        folder,
        work
      );
      expect(JSON.parse(stdout).projects.total).toBe(1);
    } finally {
      await rm(folder, { force: true, recursive: true });
    }
  });
});

describe("server search is live and read-only", () => {
  test("writes nothing to the config directory, and sends the same requests each time", async () => {
    const before = await treeOf(dir);
    const first = good.requests.length;
    await run(["server", "search", "web"]);
    const second = good.requests.length;
    await run(["server", "search", "web", "--json"]);
    expect(await treeOf(dir)).toEqual(before);
    expect(good.requests.length - second).toBe(second - first);
  });

  test("searches four projects at a time, and every project once", async () => {
    const before = good.requests.length;
    const { code } = await run(["server", "search"]);
    expect(code).toBe(0);
    const sent = good.requests.slice(before);
    expect(sent.filter((r) => r === "GET /api/v3/instances")).toHaveLength(5);
    expect(sent.filter((r) => r === "GET /v3/auth/projects")).toHaveLength(1);
    expect(good.peakInFlight()).toBeGreaterThan(1);
    expect(good.peakInFlight()).toBeLessThanOrEqual(4);
  });

  test("shows up in the server help with its example", async () => {
    const { code, stdout } = await run(["server", "search", "--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("nipa server search [query]");
    expect(stdout).toContain("nipa server search web");
    const group = await run(["server", "--help"]);
    expect(group.stdout).toContain("nipa server search web");
  });
});

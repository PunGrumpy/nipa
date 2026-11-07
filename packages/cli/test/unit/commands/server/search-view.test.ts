import { describe, expect, test } from "bun:test";

import { program } from "../../../../src/commands";
import {
  commandFor,
  contextLine,
  failureLines,
  failureMessage,
  groupLines,
  hitsOf,
  PIPE_HEADINGS,
  pipeRows,
  projectRef,
  serverRef,
} from "../../../../src/commands/server/search-view";
import type { Hit } from "../../../../src/commands/server/search-view";
import { programSpec } from "../../../../src/util/command";
import type { Server } from "../../../../src/util/compute";
import type { Project } from "../../../../src/util/keystone";
import type { RunScope } from "../../../../src/util/scope";
import type { Failed, Outcome } from "../../../../src/util/server-search";
import { CliError } from "../../../../src/util/ui";

const ALPHA: Project = { id: "a".repeat(32), name: "Alpha" };
const BETA: Project = { id: "b".repeat(32), name: "Beta" };
const projects = [ALPHA, BETA];

const server = (name: string, over: Partial<Server> = {}): Server => ({
  addresses: [{ address: "203.0.113.10", type: "floating", version: 4 }],
  createdAt: "2026-11-03T00:00:00Z",
  flavor: "csa.large.v2",
  id: `id-${name}`,
  kubernetes: null,
  name,
  ramMb: null,
  securityGroups: [],
  status: "ACTIVE",
  vcpus: null,
  volumes: [],
  zone: null,
  ...over,
});

const node = (name: string, role: string): Server =>
  server(name, { kubernetes: { clusterId: "c", role, version: null } });

const hit = (project: Project, s: Server, nameRepeats = false): Hit => ({
  nameRepeats,
  project,
  server: s,
});

const plain = (lines: readonly string[]): string[] =>
  lines.map((line) => Bun.stripANSI(line));

const all = (searched: number, total: number) =>
  ({ kind: "projects", searched, total }) as const;

const line = (input: Parameters<typeof contextLine>[0]) =>
  Bun.stripANSI(contextLine(input));

describe("contextLine", () => {
  test("counts the matches and the projects, with the time it took", () => {
    expect(
      line({ elapsed: "200ms", hits: 5, query: "web", scope: all(4, 4) })
    ).toBe('5 servers match "web" in 4 projects [200ms]');
  });

  test("one match reads in the singular", () => {
    expect(
      line({ elapsed: "1s", hits: 1, query: "web", scope: all(1, 1) })
    ).toBe('1 server matches "web" in 1 project [1s]');
  });

  test("without a query it counts every server", () => {
    expect(line({ elapsed: "9ms", hits: 7, scope: all(3, 3) })).toBe(
      "7 servers in 3 projects [9ms]"
    );
    expect(line({ elapsed: "9ms", hits: 7, query: "", scope: all(3, 3) })).toBe(
      "7 servers in 3 projects [9ms]"
    );
  });

  test("a search that skipped projects says how many it covered", () => {
    expect(
      line({ elapsed: "400ms", hits: 5, query: "web", scope: all(4, 6) })
    ).toBe('5 servers match "web" in 4 of 6 projects [400ms]');
  });

  test("no matches names the query and the projects", () => {
    expect(
      line({ elapsed: "9ms", hits: 0, query: "zzz", scope: all(4, 4) })
    ).toBe('No servers match "zzz" in 4 projects. [9ms]');
    expect(line({ elapsed: "9ms", hits: 0, scope: all(4, 4) })).toBe(
      "No servers in 4 projects. [9ms]"
    );
  });

  test("no matches with a failure never claims every project", () => {
    const text = line({
      elapsed: "9ms",
      hits: 0,
      query: "zzz",
      scope: all(4, 6),
    });
    expect(text).toBe('No servers match "zzz" in 4 of 6 projects. [9ms]');
    expect(text).not.toContain("in 6 projects");
  });

  test("under -p it names the project", () => {
    expect(
      line({
        elapsed: "9ms",
        hits: 2,
        query: "web",
        scope: { kind: "project", name: "Beta" },
      })
    ).toBe('2 servers match "web" in Beta [9ms]');
  });

  test("a query or a project name with a line break stays on one line", () => {
    const text = line({
      elapsed: "9ms",
      hits: 0,
      query: "a\nb",
      scope: { kind: "project", name: "x\ny" },
    });
    expect(text.split("\n")).toHaveLength(1);
  });
});

const headings = (lines: readonly string[]) =>
  plain(lines).filter((row) => /^ {2}\S/u.test(row));

describe("groupLines", () => {
  const web = [
    hit(ALPHA, server("web-2", { status: "BUILD" })),
    hit(ALPHA, server("web-1", { id: "id-1" }), true),
    hit(
      ALPHA,
      server("web-1", {
        addresses: [{ address: "192.0.2.77", type: "fixed", version: 4 }],
        id: "id-2",
        status: "SHUTOFF",
      }),
      true
    ),
    hit(BETA, server("web-1", { id: "id-3" })),
  ];

  test("groups the matches under their projects and marks the current one", () => {
    const out = plain(
      groupLines({ current: ALPHA.id, hits: web, projects, width: 80 })
    );
    expect(out).toEqual([
      "",
      "  Alpha (current)",
      "    web-2   ● Build     203.0.113.10",
      "    web-1   ● Active    203.0.113.10",
      "      ID id-1",
      "    web-1   ● Shutoff   192.0.2.77",
      "      ID id-2",
      "",
      "  Beta",
      "    web-1   ● Active    203.0.113.10",
      "",
    ]);
  });

  test("shows an ID only under a name the project repeats", () => {
    const out = plain(groupLines({ hits: web, projects, width: 80 })).join(
      "\n"
    );
    expect(out.match(/ID id-/gu)).toHaveLength(2);
    expect(out).not.toContain("ID id-3");
    expect(out).not.toContain("(current)");
  });

  test("with nothing to show it prints nothing", () => {
    expect(groupLines({ hits: [], projects, width: 80 })).toEqual([]);
  });

  test("a Kubernetes node shows its role, and shortens it when the row doesn't fit", () => {
    const hits = [
      hit(ALPHA, node("payments-prod-k8s-x7f2ab9c-master-0", "master")),
    ];
    const wide = plain(groupLines({ hits, projects, width: 100 })).join("\n");
    expect(wide).toContain(
      "payments-prod-k8s-x7f2ab9c-master-0 (Kubernetes master)"
    );
    const narrow = plain(groupLines({ hits, projects, width: 70 }));
    expect(narrow.join("\n")).toContain(
      "payments-prod-k8s-x7f2ab9c-master-0 (master)"
    );
    expect(narrow.join("\n")).not.toContain("Kubernetes");
    for (const row of narrow) {
      expect(row.length).toBeLessThanOrEqual(70);
    }
  });

  test("a terminal too narrow for a row gets two lines per server, and nothing is cut", () => {
    const hits = [
      hit(ALPHA, node("payments-prod-k8s-x7f2ab9c-node-0", "worker")),
      hit(ALPHA, server("web-1", { id: "id-1" }), true),
    ];
    const out = plain(groupLines({ hits, projects, width: 40 }));
    expect(out).toEqual([
      "",
      "  Alpha",
      "    payments-prod-k8s-x7f2ab9c-node-0 (worker)",
      "      ● Active   203.0.113.10",
      "    web-1",
      "      ● Active   203.0.113.10",
      "      ID id-1",
      "",
    ]);
  });

  test("keeps a row at the exact width and breaks it one column below", () => {
    const hits = [hit(ALPHA, server("web-1"))];
    // "    web-1" + 3 + "● Active" + 3 + "203.0.113.10"
    const exact = 4 + 5 + 3 + 8 + 3 + 12;
    expect(plain(groupLines({ hits, projects, width: exact }))[2]).toContain(
      "web-1   ●"
    );
    expect(plain(groupLines({ hits, projects, width: exact - 1 }))[2]).toBe(
      "    web-1"
    );
  });

  test("a remote name can't forge a line or carry an escape", () => {
    const hits = [
      hit(ALPHA, server("web\n  > forged\u001B[2J", { id: "id-x" })),
    ];
    const lines = plain(groupLines({ hits, projects, width: 80 }));
    expect(lines).toHaveLength(4);
    expect(lines.join("\n")).not.toContain("\u001B");
  });

  test("keeps two projects' servers of the same name under their own project", () => {
    const out = plain(
      groupLines({
        hits: [hit(ALPHA, server("web-1")), hit(BETA, server("web-1"))],
        projects,
        width: 80,
      })
    );
    expect(out.filter((row) => /^ {2}\S/u.test(row))).toEqual([
      "  Alpha",
      "  Beta",
    ]);
  });

  describe("two projects with the same name", () => {
    const twin: Project = { id: "d".repeat(32), name: "Beta" };
    const hits = [
      hit(ALPHA, server("web-1")),
      hit(BETA, server("web-1")),
      hit(twin, server("web-2")),
    ];

    test("each shows its ID after the name, and a project with a unique name shows none", () => {
      const out = groupLines({
        current: BETA.id,
        hits,
        projects: [ALPHA, BETA, twin],
        width: 80,
      });
      expect(headings(out)).toEqual([
        "  Alpha",
        `  Beta ${BETA.id} (current)`,
        `  Beta ${twin.id}`,
      ]);
    });

    test("a narrow terminal's records show it too", () => {
      const out = groupLines({
        hits,
        projects: [ALPHA, BETA, twin],
        width: 30,
      });
      expect(headings(out)).toContain(`  Beta ${twin.id}`);
    });
  });
});

const searched = (
  project: Project,
  servers: Server[],
  repeated: string[] = []
): Outcome => ({ project, repeated: new Set(repeated), servers });

describe("hitsOf", () => {
  test("pairs each match with its project, and flags a repeated name even for a lone match", () => {
    const lone = server("web-1", { id: "id-2" });
    const hits = hitsOf([
      searched(ALPHA, [lone], ["web-1"]),
      searched(BETA, [server("db-1")]),
      {
        failure: {
          cause: new CliError("no"),
          message: "no",
          status: 403,
        },
        project: { id: "c".repeat(32), name: "Gamma" },
      },
    ]);
    expect(
      hits.map((h) => [h.project.name, h.server.name, h.nameRepeats])
    ).toEqual([
      ["Alpha", "web-1", true],
      ["Beta", "db-1", false],
    ]);
  });
});

describe("pipeRows", () => {
  test("has a field for every heading, with the project, the status label and an ISO time", () => {
    const rows = pipeRows([
      hit(BETA, node("k8s-master-0", "master"), false),
      hit(
        ALPHA,
        server("web-1", { addresses: [], flavor: "m1", status: "SHUTOFF" })
      ),
    ]);
    expect(PIPE_HEADINGS).toEqual([
      "ID",
      "Name",
      "Project",
      "Project ID",
      "Status",
      "Address",
      "Flavor",
      "Created",
    ]);
    expect(rows.map((row) => row.length)).toEqual([8, 8]);
    expect(rows[0]).toEqual([
      "id-k8s-master-0",
      "k8s-master-0",
      "Beta",
      BETA.id,
      "Active",
      "203.0.113.10",
      "csa.large.v2",
      "2026-11-03T00:00:00.000Z",
    ]);
    // A server with no address has an empty field, not a dash.
    expect(rows[1]?.[4]).toBe("Shutoff");
    expect(rows[1]?.[5]).toBe("");
  });
});

const failed = (count: number, message = "no"): Failed[] =>
  Array.from({ length: count }, (_, at) => ({
    failure: { cause: new CliError(message), message, status: 403 },
    project: { id: String(at), name: `P${at}` },
  }));

describe("failureLines", () => {
  test("lists up to five projects with what went wrong", () => {
    expect(failureLines(failed(2, "denied"))).toEqual([
      "  P0: denied",
      "  P1: denied",
    ]);
    expect(failureLines(failed(5))).toHaveLength(5);
  });

  test("past five it counts the rest", () => {
    const lines = failureLines(failed(17));
    expect(lines).toHaveLength(6);
    expect(lines.at(-1)).toBe("  and 12 more");
  });

  test("a remote message with a line break stays on its line", () => {
    expect(failureLines(failed(1, "a\n> forged"))).toEqual([
      String.raw`  P0: a\n> forged`,
    ]);
  });

  test("the message says how many projects were searched and failed", () => {
    expect(failureMessage({ failed: failed(2, "denied"), total: 6 })).toBe(
      "Searched 4 of 6 projects. 2 failed.\n  P0: denied\n  P1: denied"
    );
  });
});

describe("the commands it suggests", () => {
  const specs = programSpec(program);
  const scope = (given: { profile?: string; project?: string }): RunScope => ({
    ...given,
    program: specs,
  });

  test("names the match's project after nipa, and keeps -P", () => {
    expect(
      commandFor({
        command: "nipa server inspect worker",
        project: "Beta",
        scope: scope({}),
      })
    ).toBe("nipa -p Beta server inspect worker");
    expect(
      commandFor({
        command: "nipa server inspect worker",
        project: "Beta",
        scope: scope({ profile: "staging" }),
      })
    ).toBe("nipa -P staging -p Beta server inspect worker");
  });

  test("quotes a project name with a space", () => {
    expect(
      commandFor({
        command: "nipa server ls",
        project: "My Project",
        scope: scope({}),
      })
    ).toBe("nipa -p 'My Project' server ls");
  });

  test("under -p it leaves the run's own project", () => {
    expect(
      commandFor({
        command: "nipa server inspect worker",
        scope: scope({ project: "Beta" }),
      })
    ).toBe("nipa -p Beta server inspect worker");
  });

  test("the match's project wins over the run's -p", () => {
    expect(
      commandFor({
        command: "nipa server ls",
        project: "Finance",
        scope: scope({ project: "Beta" }),
      })
    ).toBe("nipa -p Finance server ls");
  });

  test("without a run scope it is the plain command", () => {
    expect(commandFor({ command: "nipa server ls", project: "Beta" })).toBe(
      "nipa server ls"
    );
  });

  test("names a project by its ID when another project has the same name", () => {
    const twin: Project = { id: "d".repeat(32), name: "Beta" };
    expect(projectRef(BETA, [ALPHA, BETA])).toBe("Beta");
    expect(projectRef(BETA, [ALPHA, BETA, twin])).toBe(BETA.id);
  });

  test("names a server by its ID when the project has more than one by that name, and quotes the rest", () => {
    expect(serverRef(hit(ALPHA, server("worker")))).toBe("worker");
    expect(serverRef(hit(ALPHA, server("worker", { id: "id-9" }), true))).toBe(
      "id-9"
    );
    expect(serverRef(hit(ALPHA, server("my server")))).toBe("'my server'");
  });
});

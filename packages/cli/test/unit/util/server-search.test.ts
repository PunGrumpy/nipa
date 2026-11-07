import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { ApiError } from "../../../src/util/api";
import type { Server } from "../../../src/util/compute";
import { NetworkError } from "../../../src/util/http";
import { KeystoneError, loginWithPassword } from "../../../src/util/keystone";
import type { Project } from "../../../src/util/keystone";
import {
  describeFailure,
  matchesServer,
  orderOutcomes,
  repeatedNames,
  searchProjects,
  SEARCH_CONCURRENCY,
  sharedFailure,
} from "../../../src/util/server-search";
import type { Outcome } from "../../../src/util/server-search";
import { toSession } from "../../../src/util/session";
import type { ActiveProfile } from "../../../src/util/session";
import { CliError } from "../../../src/util/ui";
import {
  ALPHA_ID,
  BETA_ID,
  FAKE_PASSWORD,
  PLAIN_USER,
  startFakeKeystone,
} from "../../mocks/keystone";
import type { FakeKeystone } from "../../mocks/keystone";
import { fakeInstance } from "../../mocks/space";

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

describe("matchesServer", () => {
  const web = server("Web-Front", {
    addresses: [
      { address: "192.0.2.5", type: "fixed", version: 4 },
      { address: "2001:db8::5", type: "fixed", version: 6 },
      { address: "203.0.113.10", type: "floating", version: 4 },
    ],
    id: "22222222-2222-4222-8222-222222222222",
  });

  test.each([
    ["a piece of the name, in any case", "WEB-fr"],
    ["a piece of the ID", "2222-4222"],
    ["an IPv4 address", "192.0.2"],
    ["a floating address", "203.0.113.10"],
    ["an IPv6 address", "2001:db8::5"],
  ])("finds a server by %s", (_what, query) => {
    expect(matchesServer(web, query)).toBe(true);
  });

  test("no query, or an empty one, matches every server", () => {
    expect(matchesServer(web)).toBe(true);
    expect(matchesServer(web, "")).toBe(true);
  });

  test("a query that matches nothing about the server misses", () => {
    expect(matchesServer(web, "db-1")).toBe(false);
    expect(matchesServer(web, "198.51.100")).toBe(false);
  });

  test("the query is literal text, so a dot is a dot and a pattern is not one", () => {
    expect(matchesServer(web, "192x0x2")).toBe(false);
    expect(matchesServer(web, "192.0.2")).toBe(true);
    expect(matchesServer(web, "web.*")).toBe(false);
    expect(matchesServer(web, "^web")).toBe(false);
    expect(matchesServer(web, "(")).toBe(false);
    expect(matchesServer(server("a(b)"), "(b)")).toBe(true);
  });

  test("a server with no address matches only by name or ID", () => {
    const bare = server("bare", { addresses: [] });
    expect(matchesServer(bare, "bar")).toBe(true);
    expect(matchesServer(bare, "192")).toBe(false);
  });
});

describe("repeatedNames", () => {
  test("lists a name once however often it repeats, and leaves out single names", () => {
    const names = repeatedNames([
      server("web-1", { id: "a" }),
      server("db-1"),
      server("web-1", { id: "b" }),
      server("web-1", { id: "c" }),
    ]);
    expect([...names]).toEqual(["web-1"]);
  });
});

const found = (project: Project): Outcome => ({
  project,
  repeated: new Set(),
  servers: [],
});

describe("orderOutcomes", () => {
  test("sorts projects by name, then by ID, and leaves the input alone", () => {
    const input = [
      found({ id: "3", name: "Gamma" }),
      found({ id: "2", name: "Beta" }),
      found({ id: "1", name: "Beta" }),
      found({ id: "4", name: "Alpha" }),
    ];
    expect(orderOutcomes(input).map(({ project }) => project.id)).toEqual([
      "4",
      "1",
      "2",
      "3",
    ]);
    expect(input[0]?.project.name).toBe("Gamma");
  });
});

describe("describeFailure", () => {
  test("a Keystone 401 is a refused project", () => {
    expect(describeFailure(new KeystoneError("anything", 401))).toMatchObject({
      message: "Keystone refused the project",
      status: 401,
    });
  });

  test("an API error keeps the message and the status the API sent", () => {
    expect(
      describeFailure(new ApiError("You are not allowed to list servers", 403))
    ).toMatchObject({
      message: "You are not allowed to list servers",
      status: 403,
    });
  });

  test("a dropped connection has no status", () => {
    const failure = describeFailure(
      new NetworkError("https://space.example/api", "connection refused")
    );
    expect(failure.status).toBeNull();
    expect(failure.cause.reason).toBe("network_error");
  });

  test("a revoked session is a 401 with its login recovery", () => {
    const failure = describeFailure(
      new CliError("your prod session expired or was revoked", {
        reason: "token_expired",
      })
    );
    expect(failure.status).toBe(401);
  });

  test("a bug is thrown again, not listed as a project's fault", () => {
    expect(() => describeFailure(new TypeError("x is undefined"))).toThrow(
      TypeError
    );
  });
});

const expired = () =>
  new CliError("your prod session expired or was revoked", {
    reason: "token_expired",
  });

const forbidden = () => new CliError("no", { reason: "api_error" });

describe("sharedFailure", () => {
  const project = { id: "1", name: "Alpha" };
  const failed = (cause: CliError): Outcome => ({
    failure: { cause, message: cause.message, status: null },
    project,
  });
  test("returns the one error every project failed with when it's the session or the network", () => {
    const one = expired();
    expect(sharedFailure([failed(one), failed(expired())])).toBe(one);
  });

  test("returns nothing when any project was searched", () => {
    expect(
      sharedFailure([
        failed(expired()),
        { project, repeated: new Set(), servers: [] },
      ])
    ).toBeUndefined();
  });

  test("returns nothing when the failures differ, or are the project's own", () => {
    expect(
      sharedFailure([
        failed(expired()),
        failed(new CliError("can't reach x", { reason: "network_error" })),
      ])
    ).toBeUndefined();
    expect(
      sharedFailure([failed(forbidden()), failed(forbidden())])
    ).toBeUndefined();
    expect(sharedFailure([])).toBeUndefined();
  });
});

const names = (outcomes: readonly Outcome[]) =>
  outcomes.map(({ project }) => project.name);

describe("searchProjects against a fake Keystone", () => {
  const GAMMA_ID = "99999999999999999999999999999991";
  const DELTA_ID = "99999999999999999999999999999992";
  const EPSILON_ID = "99999999999999999999999999999993";
  const ZETA_ID = "99999999999999999999999999999994";
  const ETA_ID = "99999999999999999999999999999995";
  const LAGGARD_ID = "99999999999999999999999999999996";
  const EXTRA = [
    { id: GAMMA_ID, name: "Gamma" },
    { id: DELTA_ID, name: "Delta" },
    { id: EPSILON_ID, name: "Epsilon" },
    { id: ZETA_ID, name: "Zeta" },
    { id: ETA_ID, name: "Eta" },
    { id: LAGGARD_ID, name: "Laggard" },
  ];
  let keystone: FakeKeystone;
  let active: ActiveProfile;
  let session: ReturnType<typeof toSession>;
  let projects: Project[];

  const start = async (options: Parameters<typeof startFakeKeystone>[0]) => {
    keystone = startFakeKeystone(options);
    const account = {
      authUrl: keystone.url,
      projectId: ALPHA_ID,
      userDomain: "nipacloud",
      username: PLAIN_USER.name,
    };
    const first = await loginWithPassword(account, FAKE_PASSWORD);
    if (first.kind !== "token" || !first.token.project) {
      throw new Error("expected a scoped token");
    }
    session = toSession(first.token, first.token.project);
    // SAFETY: searchProjects reads only the name and the profile. The config and the link belong to the dispatcher.
    active = {
      config: { currentProfile: "prod", profiles: {} },
      name: "prod",
      profile: {
        authUrl: keystone.url,
        region: "NCP-TH",
        spaceUrl: `${keystone.url}/api`,
        userDomain: "nipacloud",
      },
      source: "config",
    } as ActiveProfile;
    projects = [
      { id: ALPHA_ID, name: "Alpha" },
      { id: BETA_ID, name: "Beta" },
      ...EXTRA,
    ];
  };

  const search = (query?: string, extra = {}) =>
    searchProjects({
      active,
      projects,
      query,
      session,
      spaceUrl: `${keystone.url}/api`,
      ...extra,
    });

  afterAll(() => {
    keystone.stop();
  });

  describe("with servers in several projects", () => {
    beforeAll(async () => {
      await start({
        extraProjects: EXTRA,
        projects: {
          fail: { [DELTA_ID]: 403 },
          latencyMs: 40,
          servers: {
            [BETA_ID]: [
              fakeInstance("web-1", "b1", "198.51.100.50"),
              fakeInstance("db-1", "b2", "198.51.100.60"),
            ],
            [GAMMA_ID]: [fakeInstance("web-9", "g1", "203.0.113.21")],
            [EPSILON_ID]: [],
            [ZETA_ID]: [
              fakeInstance("web-1", "z1", "192.0.2.131"),
              fakeInstance("web-1", "z2", "192.0.2.177"),
            ],
            [ETA_ID]: [fakeInstance("api", "e1", "203.0.113.41")],
            [LAGGARD_ID]: [fakeInstance("web-7", "l1", "203.0.113.51")],
          },
        },
      });
    });

    test("finds matches in every project, ordered by project name", async () => {
      const outcomes = await search("web");
      expect(names(outcomes)).toEqual([
        "Alpha",
        "Beta",
        "Delta",
        "Epsilon",
        "Eta",
        "Gamma",
        "Laggard",
        "Zeta",
      ]);
      const hits = outcomes.flatMap((outcome) =>
        "servers" in outcome
          ? outcome.servers.map((s) => `${outcome.project.name}/${s.name}`)
          : []
      );
      expect(hits).toEqual([
        "Alpha/web-2",
        "Alpha/web-1",
        "Beta/web-1",
        "Gamma/web-9",
        "Laggard/web-7",
        "Zeta/web-1",
        "Zeta/web-1",
      ]);
    });

    test("a project that refuses is a result of its own, with the status and message", async () => {
      const outcomes = await search("web");
      const delta = outcomes.find(({ project }) => project.id === DELTA_ID);
      expect(delta).toMatchObject({
        failure: {
          message: "You are not allowed to list servers",
          status: 403,
        },
      });
    });

    test("runs no more than four projects at once, and more than one", async () => {
      expect(SEARCH_CONCURRENCY).toBe(4);
      await search();
      expect(keystone.peakInFlight()).toBeGreaterThan(1);
      expect(keystone.peakInFlight()).toBeLessThanOrEqual(4);
    });

    test("the saved project needs no token exchange, and every other project gets one", async () => {
      const before = keystone.requests.length;
      await search("web");
      const sent = keystone.requests.slice(before);
      expect(sent.filter((r) => r === "POST /v3/auth/tokens")).toHaveLength(
        projects.length - 1
      );
      expect(sent.filter((r) => r === "GET /api/v3/instances")).toHaveLength(
        projects.length
      );
    });

    test("does not store anything: the same search twice sends the same requests", async () => {
      const first = keystone.requests.length;
      await search("web");
      const second = keystone.requests.length;
      await search("web");
      expect(keystone.requests.length - second).toBe(second - first);
    });

    test("remembers a name that repeats in a project, even when only one of them matches", async () => {
      const outcomes = await search("192.0.2.177");
      const zeta = outcomes.find(({ project }) => project.id === ZETA_ID);
      if (!zeta || "failure" in zeta) {
        throw new Error("expected Zeta to be searched");
      }
      expect(zeta.servers.map((s) => s.id)).toEqual(["z2"]);
      expect([...zeta.repeated]).toEqual(["web-1"]);
    });
  });

  describe("with a project that never answers", () => {
    beforeAll(async () => {
      await start({
        extraProjects: EXTRA,
        projects: {
          hang: [GAMMA_ID],
          latencyMs: 20,
          servers: {
            [BETA_ID]: [fakeInstance("web-1", "b1", "198.51.100.50")],
          },
        },
      });
    });

    test("gives up on it at its deadline, and the others finish well before that", async () => {
      const started = performance.now();
      const outcomes = await search("web", { deadlineMs: 400, limit: 2 });
      const elapsed = performance.now() - started;
      const gamma = outcomes.find(({ project }) => project.id === GAMMA_ID);
      expect(gamma).toMatchObject({
        failure: { message: "didn't answer in 400ms", status: null },
      });
      expect(outcomes.filter((o) => "servers" in o)).toHaveLength(
        projects.length - 1
      );
      // One of the two places was held for the whole deadline, and the other
      // searched the seven others in the meantime.
      expect(elapsed).toBeGreaterThanOrEqual(400);
      expect(elapsed).toBeLessThan(900);
    });
  });

  describe("with a project Keystone refuses", () => {
    beforeAll(async () => {
      await start({ extraProjects: EXTRA, refuse: [ZETA_ID] });
    });

    test("lists it as refused and searches the rest", async () => {
      const outcomes = await search("web");
      const zeta = outcomes.find(({ project }) => project.id === ZETA_ID);
      expect(zeta).toMatchObject({
        failure: { message: "Keystone refused the project", status: 401 },
      });
      expect(outcomes.filter((o) => "servers" in o)).toHaveLength(
        projects.length - 1
      );
    });
  });

  describe("with a session Keystone revoked after the project list", () => {
    beforeAll(async () => {
      await start({ extraProjects: EXTRA });
    });

    // The project list is the first call and ends a revoked session with the
    // login recovery, so this window is small. Each project still fails alone.
    test("the saved project asks for a login and the others are refused", async () => {
      await fetch(`${keystone.url}/v3/auth/tokens`, {
        headers: {
          "X-Auth-Token": session.token,
          "X-Subject-Token": session.token,
        },
        method: "DELETE",
      });
      const outcomes = await search("web");
      expect(outcomes.every((o) => "failure" in o)).toBe(true);
      const alpha = outcomes.find(({ project }) => project.id === ALPHA_ID);
      expect(alpha).toMatchObject({
        failure: {
          message: "your prod session expired or was revoked",
          status: 401,
        },
      });
      const beta = outcomes.find(({ project }) => project.id === BETA_ID);
      expect(beta).toMatchObject({
        failure: { message: "Keystone refused the project", status: 401 },
      });
      // They differ, so no one error stands for all of them.
      expect(sharedFailure(outcomes)).toBeUndefined();
    });
  });
});

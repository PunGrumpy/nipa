import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  isProdKeystone,
  loadConfig,
  loadSession,
  StoreError,
} from "../../../src/util/store";

let dir: string;
const before = process.env.NIPA_CONFIG_DIR;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "nipa-store-"));
  process.env.NIPA_CONFIG_DIR = dir;
});

afterAll(async () => {
  if (before === undefined) {
    delete process.env.NIPA_CONFIG_DIR;
  } else {
    process.env.NIPA_CONFIG_DIR = before;
  }
  await rm(dir, { force: true, recursive: true });
});

beforeEach(async () => {
  await rm(path.join(dir, "config.json"), { force: true });
  await rm(path.join(dir, "auth.json"), { force: true });
});

const writeConfig = (json: string) =>
  writeFile(path.join(dir, "config.json"), json);

const writeAuth = (json: string) =>
  writeFile(path.join(dir, "auth.json"), json);

const profile = {
  authUrl: "https://keystone.example.com/v3",
  region: "NCP-TH",
  userDomain: "nipacloud",
};

const session = {
  expiresAt: "2099-01-01T00:00:00Z",
  project: { id: "a".repeat(32), name: "Alpha" },
  token: "token",
  user: { id: "u1", name: "me@example.com" },
};

describe("loadConfig", () => {
  test("a missing file gives the default with only prod", async () => {
    const config = await loadConfig();
    expect(config.currentProfile).toBe("prod");
    expect(Object.keys(config.profiles)).toEqual(["prod"]);
  });

  test("a profile with a bad URL is an error, not a reset to prod", async () => {
    await writeConfig(
      JSON.stringify({
        currentProfile: "staging",
        profiles: { staging: { ...profile, authUrl: "not-a-url" } },
      })
    );
    const attempt = loadConfig();
    await expect(attempt).rejects.toThrow(StoreError);
    await expect(attempt).rejects.toThrow("config.json");
    await expect(attempt).rejects.toThrow("staging");
  });

  test("an unknown top-level key is an error", async () => {
    await writeConfig(
      JSON.stringify({ currentProfile: "prod", profiles: {}, theme: "dark" })
    );
    await expect(loadConfig()).rejects.toThrow(StoreError);
  });

  test("a profile name with an uppercase letter is an error", async () => {
    await writeConfig(
      JSON.stringify({
        currentProfile: "Staging",
        profiles: { Staging: profile },
      })
    );
    await expect(loadConfig()).rejects.toThrow(StoreError);
  });

  test("a file from nipa 0.1 loads as the prod profile", async () => {
    await writeConfig(
      JSON.stringify({
        authUrl: "https://identity-api.nipa.cloud/v3",
        project: { id: "a".repeat(32), name: "Alpha" },
        username: "me@example.com",
      })
    );
    const config = await loadConfig();
    expect(config.currentProfile).toBe("prod");
    expect(config.profiles.prod?.username).toBe("me@example.com");
    expect(config.profiles.prod?.spaceUrl).toBe("https://space.nipa.cloud/api");
  });

  test("a profile on production's Keystone without /v3 keeps its Space API URL", async () => {
    await writeConfig(
      JSON.stringify({
        currentProfile: "work",
        profiles: {
          work: {
            ...profile,
            authUrl: "https://identity-api.nipa.cloud",
            spaceUrl: "https://space.nipa.cloud/api",
          },
        },
      })
    );
    const config = await loadConfig();
    expect(config.profiles.work?.spaceUrl).toBe("https://space.nipa.cloud/api");
  });
});

describe("isProdKeystone", () => {
  test.each([
    ["https://identity-api.nipa.cloud/v3", true],
    ["https://identity-api.nipa.cloud", true],
    ["https://identity-api.nipa.cloud/v3/", true],
    ["https://IDENTITY-API.nipa.cloud:443/v3", true],
    ["https://keystone.example.com/v3", false],
  ])("%s -> %p", (authUrl, prod) => {
    expect(isProdKeystone(authUrl)).toBe(prod);
  });
});

describe("loadSession", () => {
  test("an auth.json with an unknown top-level key is an error", async () => {
    await writeAuth(
      JSON.stringify({ sessions: { prod: session }, theme: "dark" })
    );
    await expect(loadSession("prod")).rejects.toThrow(StoreError);
  });

  test("an auth.json from nipa 0.1 loads as the prod session", async () => {
    await writeAuth(JSON.stringify(session));
    expect(await loadSession("prod")).toEqual(session);
  });
});

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { z } from "zod";

import {
  isProdKeystone,
  loadConfig,
  loadSession,
  readCache,
  saveConfig,
  StoreError,
  writeCache,
} from "../../../src/util/store";

// root reads and writes anything, and Windows ignores modes
const ignoresModes = process.getuid?.() === 0 || process.platform === "win32";

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

/** The permission bits as octal digits, like `600`. */
const modeOf = async (file: string): Promise<string> => {
  const info = await stat(file);
  return info.mode.toString(8).slice(-3);
};

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

describe("files nipa can't use", () => {
  test.skipIf(ignoresModes)(
    "an unreadable config.json is an error with a hint",
    async () => {
      await writeConfig("{}");
      await chmod(path.join(dir, "config.json"), 0o000);
      const attempt = loadConfig();
      await expect(attempt).rejects.toThrow(StoreError);
      await expect(attempt).rejects.toThrow(/^can't read /u);
      await expect(attempt).rejects.toMatchObject({
        hint: expect.stringContaining("sudo"),
      });
    }
  );

  test.skipIf(ignoresModes)(
    "an unwritable config directory is an error with a hint",
    async () => {
      const config = await loadConfig();
      // nipa resets the mode of a directory it owns, so lock the parent
      const locked = path.join(dir, "locked");
      await mkdir(locked, { mode: 0o500 });
      process.env.NIPA_CONFIG_DIR = path.join(locked, "nipa");
      try {
        const attempt = saveConfig(config);
        await expect(attempt).rejects.toThrow(StoreError);
        await expect(attempt).rejects.toThrow(/^can't write /u);
        await expect(attempt).rejects.toMatchObject({
          hint: expect.stringContaining("sudo"),
        });
      } finally {
        process.env.NIPA_CONFIG_DIR = dir;
        await chmod(locked, 0o700);
      }
    }
  );
});

describe("writes", () => {
  let cache: string;
  const cacheBefore = process.env.XDG_CACHE_HOME;

  beforeAll(async () => {
    cache = await mkdtemp(path.join(tmpdir(), "nipa-store-cache-"));
    process.env.XDG_CACHE_HOME = cache;
  });

  afterAll(async () => {
    if (cacheBefore === undefined) {
      delete process.env.XDG_CACHE_HOME;
    } else {
      process.env.XDG_CACHE_HOME = cacheBefore;
    }
    await rm(cache, { force: true, recursive: true });
  });

  test.skipIf(ignoresModes)(
    "config.json lands private, in a private directory, with no temp file left",
    async () => {
      await saveConfig({ currentProfile: "prod", profiles: {} });
      const files = await readdir(dir);
      expect(files.filter((name) => name.endsWith(".tmp"))).toEqual([]);
      expect(await modeOf(path.join(dir, "config.json"))).toBe("600");
      expect(await modeOf(dir)).toBe("700");
    }
  );

  test.skipIf(ignoresModes)(
    "an existing config.json with looser modes is replaced by a private one",
    async () => {
      const file = path.join(dir, "config.json");
      await writeFile(file, "{}", { mode: 0o644 });
      await chmod(file, 0o644);
      await saveConfig({ currentProfile: "prod", profiles: {} });
      expect(await modeOf(file)).toBe("600");
    }
  );

  test.skipIf(ignoresModes)(
    "a config directory with looser modes is made private again",
    async () => {
      await chmod(dir, 0o755);
      await saveConfig({ currentProfile: "prod", profiles: {} });
      expect(await modeOf(dir)).toBe("700");
    }
  );

  test.skipIf(ignoresModes)(
    "cache files are private, in a private directory, and read back",
    async () => {
      await writeCache("probe.json", { ok: true });
      expect(await modeOf(path.join(cache, "nipa", "probe.json"))).toBe("600");
      expect(await modeOf(path.join(cache, "nipa"))).toBe("700");
      expect(
        await readCache("probe.json", z.object({ ok: z.boolean() }))
      ).toEqual({ ok: true });
    }
  );
});

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
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { z } from "zod";

import {
  checkForUpdate,
  isNewer,
  shouldCheck,
  updateNotice,
} from "../../../src/util/update";

describe("isNewer", () => {
  test.each([
    ["0.2.0", "0.1.0", true],
    ["0.10.0", "0.9.9", true],
    ["v1.0.0", "0.9.0", true],
    ["0.1.0", "0.1.0", false],
    ["0.1.0", "0.2.0", false],
    ["0.2.0-beta.1", "0.2.0", false],
  ])("%s newer than %s: %p", (latest, current, expected) => {
    expect(isNewer(latest, current)).toBe(expected);
  });
});

describe("shouldCheck", () => {
  const release = { env: {}, isTTY: true, version: "0.1.0" };

  test("checks a release build on a terminal", () => {
    expect(shouldCheck(release)).toBe(true);
  });

  test("skips CI, scripts, dev builds and the opt-out", () => {
    expect(shouldCheck({ ...release, env: { CI: "true" } })).toBe(false);
    expect(shouldCheck({ ...release, isTTY: false })).toBe(false);
    expect(shouldCheck({ ...release, version: "0.0.0" })).toBe(false);
    expect(
      shouldCheck({ ...release, env: { NIPA_NO_UPDATE_CHECK: "1" } })
    ).toBe(false);
  });
});

test("the notice names both versions and links the release", () => {
  const notice = updateNotice("0.2.0", "0.1.0");
  expect(notice).toContain("v0.1.0");
  expect(notice).toContain("v0.2.0");
  expect(notice).toContain("releases/tag/v0.2.0");
});

/** A GitHub that answers with `tag`, or doesn't answer at all. */
const github =
  (tag?: string): (() => Promise<string | undefined>) =>
  () =>
    Promise.resolve(tag);

const options = (latest: () => Promise<string | undefined>) => ({
  env: {},
  isTTY: true,
  latest,
});

describe("checkForUpdate", () => {
  const CacheFileSchema = z.object({
    checkedAt: z.string(),
    latest: z.string(),
  });

  let cache: string;
  const before = process.env.XDG_CACHE_HOME;

  beforeAll(async () => {
    cache = await mkdtemp(path.join(tmpdir(), "nipa-update-"));
    process.env.XDG_CACHE_HOME = cache;
  });

  afterAll(async () => {
    if (before === undefined) {
      delete process.env.XDG_CACHE_HOME;
    } else {
      process.env.XDG_CACHE_HOME = before;
    }
    await rm(cache, { force: true, recursive: true });
  });

  beforeEach(async () => {
    await rm(path.join(cache, "nipa"), { force: true, recursive: true });
  });

  const readUpdate = async () => {
    const text = await readFile(
      path.join(cache, "nipa", "update.json"),
      "utf-8"
    );
    return CacheFileSchema.parse(JSON.parse(text));
  };

  const seed = async (value: { checkedAt: string; latest: string }) => {
    await mkdir(path.join(cache, "nipa"), { recursive: true });
    await writeFile(
      path.join(cache, "nipa", "update.json"),
      JSON.stringify(value)
    );
  };

  test("remembers a failed check for a day", async () => {
    let calls = 0;
    const failing = () => {
      calls += 1;
      return github()();
    };
    await checkForUpdate("0.1.0", options(failing));
    await checkForUpdate("0.1.0", options(failing));
    expect(calls).toBe(1);
    const saved = await readUpdate();
    expect(saved.latest).toBe("0.1.0");
    expect(Date.now() - Date.parse(saved.checkedAt)).toBeLessThan(60_000);
  });

  test("keeps the last known version when a check fails", async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await seed({ checkedAt: twoDaysAgo.toISOString(), latest: "99.0.0" });
    await checkForUpdate("0.1.0", options(github()));
    const saved = await readUpdate();
    expect(saved.latest).toBe("99.0.0");
    expect(Date.now() - Date.parse(saved.checkedAt)).toBeLessThan(60_000);
  });

  test("records a new version", async () => {
    await checkForUpdate("0.1.0", options(github("0.2.0")));
    const saved = await readUpdate();
    expect(saved.latest).toBe("0.2.0");
  });

  test.skipIf(process.getuid?.() === 0 || process.platform === "win32")(
    "never throws when the cache can't be written",
    async () => {
      // nipa resets the mode of its own directory, so lock the one above it
      await chmod(cache, 0o500);
      try {
        await expect(
          checkForUpdate("0.1.0", options(github("0.2.0")))
        ).resolves.toBeUndefined();
      } finally {
        await chmod(cache, 0o700);
      }
      await expect(readUpdate()).rejects.toThrow();
    }
  );
});

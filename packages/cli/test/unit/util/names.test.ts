import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { resourceNames } from "../../../src/util/names";
import { fakeSpace } from "../../helpers";

let cache: string;
const before = process.env.XDG_CACHE_HOME;

beforeAll(async () => {
  cache = await mkdtemp(path.join(tmpdir(), "nipa-names-"));
  process.env.XDG_CACHE_HOME = cache;
});

afterAll(async () => {
  process.env.XDG_CACHE_HOME = before;
  await rm(cache, { force: true, recursive: true });
});

const flavorSpace = () => {
  const asked: string[] = [];
  const space = fakeSpace({
    get: (route, schema) => {
      asked.push(route);
      return Promise.resolve(
        schema.parse({ machine_types: [{ name: "a" }, { name: "b" }] })
      );
    },
  });
  return { asked, space };
};

describe("resourceNames", () => {
  test("keeps a list for a minute, per profile and project", async () => {
    const { asked, space } = flavorSpace();
    const get = (scope: string, now: number) =>
      resourceNames({
        connect: () => Promise.resolve(space),
        kind: "flavors",
        now,
        scope,
      });
    expect(await get("prod:p1", 0)).toEqual(["a", "b"]);
    await get("prod:p1", 59_000);
    expect(asked).toHaveLength(1);
    await get("prod:p2", 59_000);
    expect(asked).toHaveLength(2);
    await get("prod:p1", 60_000);
    expect(asked).toHaveLength(3);
  });
});

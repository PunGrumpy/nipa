import { describe, expect, test } from "bun:test";

import { findServer } from "../../../src/util/find";
import { fakeSpace } from "../../helpers";

const instance = (id: string, name: string) => ({
  created: "2030-01-01T00:00:00Z",
  external_ips: [],
  flavor: { name: "csa.large.v2" },
  id,
  internal_ips: [],
  name,
  status: "ACTIVE",
});

const space = fakeSpace({
  get: (_path, schema) =>
    Promise.resolve(
      schema.parse({
        instances: [
          instance("s1", "web"),
          instance("s2", "web"),
          instance("s3", "db"),
        ],
      })
    ),
});

const find = (ref: string) => findServer({ projectName: "Alpha", ref, space });

describe("findServer", () => {
  test("by name, or by ID when two share a name", async () => {
    const byName = await find("db");
    expect(byName.id).toBe("s3");
    const byId = await find("s2");
    expect(byId.id).toBe("s2");
  });

  test("a shared name lists the IDs to pick from", async () => {
    const attempt = find("web");
    await expect(attempt).rejects.toThrow('2 servers in Alpha are named "web"');
    await expect(attempt).rejects.toMatchObject({
      hint: "Name one by its ID instead: s1, s2.",
    });
  });

  test("no match points to server ls", async () => {
    const attempt = find("nope");
    await expect(attempt).rejects.toThrow(
      'no server named or with ID "nope" in Alpha'
    );
    await expect(attempt).rejects.toMatchObject({
      hint: "Run `nipa server ls` to see your servers.",
    });
  });
});

import { describe, expect, test } from "bun:test";

import {
  DATABASES,
  LOAD_BALANCERS,
  NETWORKS,
  VOLUMES,
  findResource,
  findServer,
} from "../../../src/util/find";
import type { Findable } from "../../../src/util/find";
import { CliError } from "../../../src/util/ui";
import { fakeSpace } from "../../helpers";

const instance = (
  id: string,
  name: string,
  extra: { status?: string; address?: string } = {}
) => ({
  created: "2030-01-01T00:00:00Z",
  external_ips: [],
  flavor: { name: "csa.large.v2" },
  id,
  internal_ips: extra.address === undefined ? [] : [{ address: extra.address }],
  name,
  status: extra.status ?? "ACTIVE",
});

const spaceOf = (instances: ReturnType<typeof instance>[]) =>
  fakeSpace({
    get: (_path, schema) => Promise.resolve(schema.parse({ instances })),
  });

const space = spaceOf([
  instance("s1", "web"),
  instance("s2", "web"),
  instance("s3", "db"),
]);

const find = (ref: string) => findServer({ projectName: "Alpha", ref, space });

const twins = (count: number) =>
  spaceOf(
    Array.from({ length: count }, (_, index) =>
      instance(`w${index + 1}`, "worker", {
        address: `192.0.2.${index + 1}`,
        status: index % 2 === 0 ? "ACTIVE" : "SHUTOFF",
      })
    )
  );

const ambiguity = async (given: ReturnType<typeof spaceOf>) => {
  try {
    await findServer({ projectName: "Alpha", ref: "worker", space: given });
  } catch (error) {
    if (error instanceof CliError) {
      return { error, hint: error.hint ?? "" };
    }
    throw error;
  }
  throw new Error("expected an ambiguity error");
};

describe("findServer", () => {
  test("by name, or by ID when two share a name", async () => {
    const byName = await find("db");
    expect(byName.id).toBe("s3");
    const byId = await find("s2");
    expect(byId.id).toBe("s2");
  });

  test("a shared name lists each server with its status and address", async () => {
    const { error, hint } = await ambiguity(twins(3));
    expect(error.message).toBe('3 servers in Alpha are named "worker"');
    expect(hint.split("\n")).toEqual([
      "Name one by its ID:",
      "    w1  ● Active   192.0.2.1",
      "    w2  ● Shutoff  192.0.2.2",
      "    w3  ● Active   192.0.2.3",
    ]);
    expect(error).toMatchObject({ reason: "ambiguous_name" });
    expect(hint).not.toContain("instead:");
  });

  test("five candidates all show, with no count of the rest", async () => {
    const { hint } = await ambiguity(twins(5));
    expect(hint.split("\n")).toHaveLength(6);
    expect(hint).toContain("w5");
    expect(hint).not.toContain("more");
  });

  test("seven candidates show five, then how many more and the list command", async () => {
    const { hint } = await ambiguity(twins(7));
    const lines = hint.split("\n");
    expect(lines).toHaveLength(7);
    expect(lines.at(-1)).toBe(
      "    and 2 more. Run `nipa server ls --json` to get their IDs."
    );
    expect(hint).toContain("w5");
    expect(hint).not.toContain("w6");
    expect(hint).not.toContain("w7");
  });

  test("a server without an address shows its status alone", async () => {
    const { hint } = await ambiguity(
      spaceOf([
        instance("w1", "worker", { address: "192.0.2.1" }),
        instance("w2", "worker"),
      ])
    );
    expect(hint.split("\n")).toEqual([
      "Name one by its ID:",
      "    w1  ● Active  192.0.2.1",
      "    w2  ● Active",
    ]);
  });

  test("a row without an address has no trailing padding", async () => {
    const { hint } = await ambiguity(
      spaceOf([
        instance("w1", "worker", { address: "192.0.2.1", status: "SHUTOFF" }),
        instance("w2", "worker"),
      ])
    );
    expect(hint.split("\n").at(-1)).toBe("    w2  ● Active");
  });

  test("data.ids holds every ID, past the five a person sees", async () => {
    const { error } = await ambiguity(twins(7));
    expect(error.data).toEqual({
      ids: ["w1", "w2", "w3", "w4", "w5", "w6", "w7"],
    });
  });

  test("the other kinds show the columns their ls shows", () => {
    const base = { createdAt: "2026-11-03T00:00:00Z", id: "x", name: "x" };
    expect(
      VOLUMES.describe?.({
        ...base,
        attachments: [],
        bootable: false,
        sizeGb: 2000,
        status: "available",
        type: null,
        zone: "z",
      })
    ).toEqual(["● Available", "2000 GB"]);
    expect(
      NETWORKS.describe?.({
        ...base,
        external: true,
        shared: true,
        status: "ACTIVE",
        zone: "z1",
      })
    ).toEqual(["● Active", "external", "z1"]);
    expect(
      LOAD_BALANCERS.describe?.({
        ...base,
        address: "192.0.2.5",
        health: "ONLINE",
        listeners: 1,
        status: "ACTIVE",
      })
    ).toEqual(["● Active", "192.0.2.5"]);
    expect(DATABASES.describe?.({ ...base, primary: null })).toEqual([]);
  });

  test("an ID, status or address can't carry an escape or a second line", async () => {
    const { hint } = await ambiguity(
      spaceOf([
        instance("w1\u001B]0;owned\u0007", "worker", {
          address: "192.0.2.1\nforged",
          status: "ACTIVE\u001B[2J",
        }),
        instance("w2", "worker"),
      ])
    );
    expect(hint).not.toContain("\u001B");
    expect(hint).not.toContain("\u0007");
    expect(hint.split("\n")).toHaveLength(3);
    expect(hint).toContain(String.raw`192.0.2.1\nforged`);
  });

  test("a kind without describe shows the IDs alone", async () => {
    const things: Findable<{ id: string; name: string }> = {
      list: () =>
        Promise.resolve([
          { id: "a1", name: "x" },
          { id: "a2", name: "x" },
        ]),
      lsCommand: "nipa thing ls",
      noun: "thing",
      plural: "things",
    };
    const attempt = findResource({
      kind: things,
      projectName: "Alpha",
      ref: "x",
      space,
    });
    await expect(attempt).rejects.toMatchObject({
      hint: "Name one by its ID:\n    a1\n    a2",
      reason: "ambiguous_name",
    });
  });

  test("no match points to server ls", async () => {
    const attempt = find("nope");
    await expect(attempt).rejects.toThrow(
      'no server named or with ID "nope" in Alpha'
    );
    await expect(attempt).rejects.toMatchObject({
      hint: "Run `nipa server ls` to see your servers.",
      next: ["nipa server ls"],
      reason: "not_found",
    });
  });
});

import { describe, expect, test } from "bun:test";

import { program } from "../../../src/commands";
import { programSpec } from "../../../src/util/command";
import {
  DATABASES,
  LOAD_BALANCERS,
  NETWORKS,
  VOLUMES,
  findResource,
  findServer,
  refWord,
} from "../../../src/util/find";
import type { Findable } from "../../../src/util/find";
import { setRunScope, shellQuote } from "../../../src/util/scope";
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

const refused = async (
  ref: string,
  given: ReturnType<typeof spaceOf> = space
): Promise<CliError> => {
  try {
    await findServer({ projectName: "Alpha", ref, space: given });
  } catch (error) {
    if (error instanceof CliError) {
      return error;
    }
    throw error;
  }
  throw new Error(`${ref} was found`);
};

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

describe("refWord", () => {
  test("keeps a plain name bare and quotes a name with a space", () => {
    expect(refWord("web-1", "id-1")).toBe("web-1");
    expect(refWord("web 1", "id-1")).toBe("'web 1'");
  });

  test("quotes a name with an apostrophe for the shell", () => {
    expect(refWord("it's", "id-1")).toBe(shellQuote("it's"));
  });

  test.each(["a`b", "a\nb", "a\tb", "", "-x"])(
    "uses the ID when %j can't sit in a hint",
    (name) => {
      expect(refWord(name, "id-1")).toBe("id-1");
    }
  );
});

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

  test("no match points to server search first, then server ls", async () => {
    const error = await refused("nope");
    expect(error).toMatchObject({
      hint: "Run `nipa server search nope` to look in every project, or `nipa server ls` to see the servers in this one.",
      message: 'no server named or with ID "nope" in Alpha',
      next: [["nipa", "server", "search", "nope"], "nipa server ls"],
      reason: "not_found",
    });
    expect(error.data).toBeUndefined();
    expect(error.hint).not.toContain("to see your servers");
  });

  test("a name close to one in the project is suggested, never put in next", async () => {
    const error = await refused(
      "Web-1",
      spaceOf([instance("s1", "web-1"), instance("s2", "db-1")])
    );
    expect(error).toMatchObject({
      data: { suggestion: "web-1" },
      hint: "Did you mean `web-1`? Run `nipa server search Web-1` to look in every project, or `nipa server ls` to see the servers in this one.",
      next: [["nipa", "server", "search", "Web-1"], "nipa server ls"],
      reason: "not_found",
    });
    expect(JSON.stringify(error.next)).not.toContain('"web-1"');
  });

  test("a name near two servers suggests none", async () => {
    const error = await refused(
      "web-2",
      spaceOf([instance("s1", "web-1"), instance("s2", "web-3")])
    );
    expect(error.data).toBeUndefined();
    expect(error.hint).not.toContain("Did you mean");
  });

  test("a name with a space is one word of the search command", async () => {
    expect(await refused("my server")).toMatchObject({
      hint: "Run `nipa server search 'my server'` to look in every project, or `nipa server ls` to see the servers in this one.",
      next: [["nipa", "server", "search", "my server"], "nipa server ls"],
    });
  });

  test("a name that can't be copied back gets no search command", async () => {
    const errors = await Promise.all(
      ["a`b", "a\nb", "-x"].map((ref) => refused(ref))
    );
    for (const error of errors) {
      expect(error).toMatchObject({
        hint: "Run `nipa server ls` to see your servers.",
        next: ["nipa server ls"],
      });
    }
  });

  test("under -p the search would read one project, so it isn't suggested", async () => {
    setRunScope({ program: programSpec(program), project: "Beta" });
    try {
      await expect(find("nope")).rejects.toMatchObject({
        hint: "Run `nipa server ls` to see your servers.",
        next: ["nipa server ls"],
      });
    } finally {
      setRunScope(undefined);
    }
  });

  test("a volume that isn't found has only the list command in next", async () => {
    const kind: typeof VOLUMES = {
      ...VOLUMES,
      list: () =>
        Promise.resolve([
          {
            attachments: [],
            bootable: false,
            createdAt: "2030-01-01T00:00:00Z",
            id: "v1",
            name: "backups",
            sizeGb: 10,
            status: "available",
            type: null,
            zone: "z",
          },
        ]),
    };
    const attempt = findResource({
      kind,
      projectName: "Alpha",
      ref: "backup",
      space,
    });
    await expect(attempt).rejects.toMatchObject({
      data: { suggestion: "backups" },
      hint: "Did you mean `backups`? Run `nipa volume ls` to see your volumes.",
      next: ["nipa volume ls"],
      reason: "not_found",
    });
  });
});

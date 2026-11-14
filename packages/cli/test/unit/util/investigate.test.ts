import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import type { Space } from "../../../src/util/api";
import { investigate } from "../../../src/util/investigate";
import { CliError } from "../../../src/util/ui";
import { alphaSpace } from "../../helpers";
import { startFakeKeystone } from "../../mocks/keystone";
import type { FakeKeystone } from "../../mocks/keystone";
import { FAKE_VOLUMES } from "../../mocks/space";

let keystone: FakeKeystone;
let space: Space;

beforeAll(async () => {
  keystone = startFakeKeystone();
  space = await alphaSpace(keystone.url);
});

afterAll(() => {
  keystone.stop();
});

const target = (ref: string, kind?: "server" | "volume") => ({
  kind,
  projectName: "Alpha",
  ref,
});

const failure = async (run: Promise<unknown>): Promise<CliError> => {
  try {
    await run;
  } catch (error) {
    if (error instanceof CliError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a CliError");
};

describe("investigate", () => {
  test("finds a server by name and judges it without a run scope", async () => {
    const result = await investigate(space, target("k8s-worker-1"));
    expect(result).toMatchObject({
      id: "55555555-5555-4555-8555-555555555555",
      kind: "server",
      name: "k8s-worker-1",
    });
    expect(result.findings[0]).toMatchObject({
      check: "status",
      next: [
        {
          argv: ["nipa", "server", "history", "k8s-worker-1"],
          command: "nipa server history k8s-worker-1",
        },
        {
          argv: ["nipa", "server", "logs", "k8s-worker-1"],
          command: "nipa server logs k8s-worker-1",
        },
      ],
      severity: "problem",
    });
    expect(result.cannotSee.length).toBeGreaterThan(0);
  });

  test("finds a Kubernetes cluster by its ID", async () => {
    const result = await investigate(
      space,
      target("dddd1111-0000-4000-8000-000000000001")
    );
    expect(result.kind).toBe("k8s");
  });

  test("a name of two kinds fails with every ID and a --kind command for each", async () => {
    FAKE_VOLUMES.push({
      ageMs: 60_000,
      attachments: [],
      availability_zone: "NCP-BKK",
      bootable: "false",
      id: "vol-web-1",
      name: "web-1",
      size: 20,
      status: "available",
      volume_type: "Standard_SSD",
    });
    try {
      const error = await failure(investigate(space, target("web-1")));
      expect(error.message).toBe(
        '"web-1" in Alpha names a server and a volume'
      );
      expect(error.reason).toBe("ambiguous_name");
      expect(error.data?.ids).toEqual([
        "22222222-2222-4222-8222-222222222222",
        "vol-web-1",
      ]);
      expect(error.hint).toContain("`nipa investigate web-1 --kind server`");
      expect(error.hint).toContain("`nipa investigate web-1 --kind volume`");
      const server = await investigate(space, target("web-1", "server"));
      expect(server.kind).toBe("server");
    } finally {
      FAKE_VOLUMES.pop();
    }
  });

  test("a name that matches nothing names every list command", async () => {
    const error = await failure(investigate(space, target("nope")));
    expect(error.message).toBe(
      'no server, load balancer, database, volume or Kubernetes cluster named or with ID "nope" in Alpha'
    );
    expect(error.reason).toBe("not_found");
    expect(error.next).toEqual([
      "nipa server ls",
      "nipa lb ls",
      "nipa db ls",
      "nipa volume ls",
      "nipa k8s ls",
    ]);
  });

  test("a kind it couldn't list becomes a warning when the name is found elsewhere", async () => {
    keystone.faults.set("GET /api/v4/volumes", 503);
    try {
      const result = await investigate(space, target("web-lb"));
      expect(result.kind).toBe("lb");
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          check: "resolve",
          severity: "warning",
          summary:
            'nipa couldn\'t read the volumes (Service Unavailable), so "web-lb" may name one of those too',
        })
      );
    } finally {
      keystone.faults.clear();
    }
  });
});

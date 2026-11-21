import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setTimeout as delay } from "node:timers/promises";

import {
  inspectSubcommand,
  sgCommand,
} from "../../../../src/commands/sg/command";
import { inspect } from "../../../../src/commands/sg/inspect";
import type { Space } from "../../../../src/util/api";
import type { Client } from "../../../../src/util/command";
import { TOOLS } from "../../../../src/util/mcp-tools";
import type { ToolContext } from "../../../../src/util/mcp-tools";
import type { Cloud } from "../../../../src/util/session";
import { fakeSpace } from "../../../helpers";
import { ALPHA_ID } from "../../../mocks/keystone";

// `sg inspect` and the `inspect_security_group` tool read the group list, the
// port list and the server list of a project. These tests give them a Space
// that answers by path, so each test decides when a list answers.

const alpha = { domainId: "d1", id: ALPHA_ID, name: "Alpha" };

const GROUP = {
  created_at: "2030-01-01T00:00:00Z",
  description: null,
  id: "g1",
  name: "web",
  security_group_rules: [],
};

/** A Space API answer: the lists it holds, by the name the API gives them. */
type Body = Record<string, object[]>;

interface Reads {
  /** The paths in the order the fake was asked for them. */
  requested: string[];
  space: Space;
}

/**
 * `groups` and `ports` are the lists' answers. A list without one answers at
 * once, with the group `web` or with nothing.
 */
const readsOf = (answers: {
  groups?: (othersAsked: Promise<true>) => Promise<Body>;
  ports?: () => Promise<Body>;
}): Reads => {
  const requested: string[] = [];
  const { promise: othersAsked, resolve: bothAsked } =
    Promise.withResolvers<true>();
  const answer = (path: string): Promise<Body> => {
    if (path === "/v4/security_groups") {
      return (
        answers.groups?.(othersAsked) ??
        Promise.resolve({ security_groups: [GROUP] })
      );
    }
    if (path === "/v2/ports") {
      return answers.ports?.() ?? Promise.resolve({ ports: [] });
    }
    return Promise.resolve({ instances: [] });
  };
  const space = fakeSpace({
    get: async (path, schema) => {
      requested.push(path);
      if (
        requested.includes("/v2/ports") &&
        requested.includes("/v3/instances")
      ) {
        bothAsked(true);
      }
      return schema.parse(await answer(path));
    },
  });
  return { requested, space };
};

// SAFETY: the code under test reads only the profile's name, the session's project and the Space API.
const cloudOf = (space: Space) =>
  ({ active: { name: "prod" }, session: { project: alpha }, space }) as Cloud;

const unused = () => Promise.reject(new Error("not used"));

const clientOf = (input: {
  space: Space;
  documents: object[];
  project?: string;
}): Client => ({
  cloud: () => Promise.resolve(cloudOf(input.space)),
  profile: unused,
  profileWithoutBrokenLink: unused,
  program: { examples: [], hidden: [], sections: [], summary: "" },
  project: input.project,
  prompts: {
    choice: unused,
    confirm: unused,
    interactive: false,
    secret: unused,
    text: unused,
  },
  savedSession: unused,
  session: unused,
  stdout: {
    isTTY: false,
    json: (value) => {
      input.documents.push(value);
    },
    line: () => {},
    write: () => {},
  },
  toolSession: unused,
});

const runHandler = async (space: Space, group: string) => {
  const documents: object[] = [];
  const { run } = inspect.prepare({
    path: [sgCommand, inspectSubcommand],
    words: [group, "--json"],
  });
  const code = await run(clientOf({ documents, space }));
  return { code, documents };
};

const contextFor = (space: Space, project?: string): ToolContext => ({
  cloud: () => Promise.resolve(cloudOf(space)),
  profile: unused,
  project,
  savedSession: unused,
});

const runTool = (space: Space, group: string) => {
  const tool = TOOLS.find((t) => t.name === "inspect_security_group");
  if (!tool) {
    throw new Error("no inspect_security_group tool");
  }
  return tool.run(contextFor(space), { group });
};

const runners = [
  ["sg inspect", (space: Space, group: string) => runHandler(space, group)],
  ["inspect_security_group", runTool],
] as const;

// A hung test would run until the 5 s timeout, so these wait for less.
const SHORT = 2000;

describe.each(runners)("%s", (_name, run) => {
  let unhandled = 0;
  const record = () => {
    unhandled += 1;
  };

  beforeEach(() => {
    unhandled = 0;
    process.on("unhandledRejection", record);
  });

  afterEach(() => {
    process.off("unhandledRejection", record);
  });

  test(
    "asks for the ports and the servers before the group list answers",
    async () => {
      // The group list answers only once both other lists were asked for, so
      // reading it first and the others after would never finish.
      const reads = readsOf({
        groups: async (othersAsked) => {
          await othersAsked;
          return { security_groups: [GROUP] };
        },
      });
      await run(reads.space, "web");
      expect(reads.requested).toEqual([
        "/v4/security_groups",
        "/v2/ports",
        "/v3/instances",
      ]);
    },
    SHORT
  );

  test(
    "fails with not_found for a missing group, and a failing port list rejects nothing unhandled",
    async () => {
      const reads = readsOf({
        groups: () => Promise.resolve({ security_groups: [GROUP] }),
        // Fails after the lookup has already thrown.
        ports: async () => {
          await delay(20);
          throw new Error("the port list failed");
        },
      });
      await expect(run(reads.space, "nope")).rejects.toMatchObject({
        reason: "not_found",
      });
      await delay(60);
      expect(unhandled).toBe(0);
    },
    SHORT
  );
});

describe("sg inspect", () => {
  test("a failing port list fails the command with its own error", async () => {
    const reads = readsOf({
      ports: () => Promise.reject(new Error("the port list failed")),
    });
    await expect(runHandler(reads.space, "web")).rejects.toThrow(
      "the port list failed"
    );
  });
});

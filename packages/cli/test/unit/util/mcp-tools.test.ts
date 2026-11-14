import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { ZodError } from "zod";

import { TOOLS } from "../../../src/util/mcp-tools";
import type { ToolContext } from "../../../src/util/mcp-tools";
import type { Cloud } from "../../../src/util/session";
import { CliError } from "../../../src/util/ui";
import { alphaSpace } from "../../helpers";
import { ALPHA_ID, startFakeKeystone } from "../../mocks/keystone";
import type { FakeKeystone } from "../../mocks/keystone";

// The tools nipa offers. A tool that changes anything belongs in no list
// here: power actions and security group rules stay in the commands, which
// ask before they act.
const READ_ONLY_TOOLS = [
  "inspect_database",
  "inspect_load_balancer",
  "inspect_security_group",
  "inspect_server",
  "list_databases",
  "list_flavors",
  "list_kubernetes_clusters",
  "list_load_balancers",
  "list_networks",
  "list_quotas",
  "list_security_groups",
  "list_servers",
  "list_volumes",
  "search_servers",
  "server_console_log",
  "server_history",
  "whoami",
];

const MUTATING =
  /(?:^|_)(?:add|create|delete|remove|restart|reboot|rm|rule|start|stop|update|set|attach|detach|resize)(?:_|$)/u;

const alpha = { domainId: "d1", id: ALPHA_ID, name: "Alpha" };

let keystone: FakeKeystone;
let ctx: ToolContext;

const contextFor = (cloud: Cloud, project?: string): ToolContext => ({
  cloud: () => Promise.resolve(cloud),
  profile: () => Promise.resolve(cloud.active),
  project,
  savedSession: () => Promise.resolve(cloud),
});

beforeAll(async () => {
  keystone = startFakeKeystone();
  // SAFETY: the tools under test read only the profile's name, the session's project and the Space API.
  const cloud = {
    active: { name: "prod" },
    session: { project: alpha },
    space: await alphaSpace(keystone.url),
  } as Cloud;
  ctx = contextFor(cloud);
});

afterAll(() => {
  keystone.stop();
});

const tool = (name: string) => {
  const found = TOOLS.find((candidate) => candidate.name === name);
  if (!found) {
    throw new Error(`no tool named ${name}`);
  }
  return found;
};

describe("the tool registry", () => {
  test("holds exactly the read-only tools", () => {
    expect(TOOLS.map((t) => t.name).toSorted()).toEqual(READ_ONLY_TOOLS);
  });

  test("no tool is named for an action that changes something", () => {
    for (const { name } of TOOLS) {
      expect(name).toMatch(/^[a-z]+(?:_[a-z]+)*$/u);
      expect(MUTATING.test(name)).toBe(false);
    }
  });

  test("every tool says when to use it, in a few sentences", () => {
    for (const { description, name } of TOOLS) {
      expect(description.length, name).toBeGreaterThan(30);
      expect(description.length, name).toBeLessThan(320);
    }
  });

  test("every tool but whoami can read another project", () => {
    for (const { input, name } of TOOLS) {
      const fields = Object.keys(input.shape);
      expect(fields.includes("project"), name).toBe(name !== "whoami");
    }
  });

  test("a tool that lists needs no input", () => {
    for (const { input, name } of TOOLS) {
      if (name.startsWith("list_") || name === "whoami") {
        expect(input.safeParse({}).success, name).toBe(true);
      }
    }
  });

  test("a tool rejects input its schema doesn't allow", async () => {
    await expect(tool("inspect_server").run(ctx, {})).rejects.toBeInstanceOf(
      ZodError
    );
    await expect(
      tool("server_console_log").run(ctx, { server: "web-1", tail: 0 })
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      tool("server_console_log").run(ctx, { server: "web-1", tail: 501 })
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe("a tool's result", () => {
  test("names the profile and project, like --json", async () => {
    const result = await tool("list_flavors").run(ctx, {});
    expect(result).toMatchObject({ profile: "prod", project: alpha });
    expect(result).toHaveProperty("flavors");
  });

  test("inspect_server returns the server with its state and last action", async () => {
    const result = await tool("inspect_server").run(ctx, { server: "web-1" });
    expect(result).toMatchObject({
      server: { lastAction: expect.anything(), name: "web-1" },
    });
  });

  test("server_console_log keeps the last lines asked for", async () => {
    const result = await tool("server_console_log").run(ctx, {
      server: "web-1",
      tail: 2,
    });
    expect(result).toMatchObject({
      logs: expect.stringMatching(/^[^\n]*\n[^\n]*\n$/u),
    });
  });

  test("inspect_load_balancer adds the diagnosis", async () => {
    const result = await tool("inspect_load_balancer").run(ctx, {
      loadBalancer: "web-lb",
    });
    expect(result).toMatchObject({
      diagnosis: { healthy: expect.any(Boolean), verdict: expect.any(String) },
      loadBalancer: { name: "web-lb" },
    });
  });

  test("a name no resource has is the not_found error the command gives", async () => {
    try {
      await tool("inspect_server").run(ctx, { server: "nope" });
      throw new Error("expected inspect_server to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect(error).toMatchObject({ reason: "not_found" });
    }
  });
});

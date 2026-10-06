import { describe, expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";

import { program as realProgram } from "../../../src/commands";
import type { GlobalValues } from "../../../src/util/arg-common";
import type { Client } from "../../../src/util/client";
import {
  defineCommand,
  defineGroup,
  definePassthrough,
  forward,
  handle,
  route,
} from "../../../src/util/command";
import type { Program } from "../../../src/util/command";
import { run } from "../../../src/util/dispatch";
import { CliError } from "../../../src/util/ui";

// A spy program: every handler records what it got, without the client.
const seen: unknown[] = [];

const recordLeaf =
  (name: string) =>
  ({ args, flags }: { args: unknown; flags: unknown }) => {
    seen.push({ args, flags, name });
    return Promise.resolve(0);
  };

const recordPassthrough =
  (name: string) =>
  ({ args, command }: { args: readonly string[]; command: string }) => {
    seen.push({ args, command, name });
    return Promise.resolve(0);
  };

const lsSpec = defineCommand({
  aliases: ["list"],
  args: [],
  flags: [{ description: "j", long: "json", value: { kind: "none" } }],
  name: "ls",
  summary: "ls",
});
const rmSpec = defineCommand({
  args: [{ arity: "one", name: "name", value: { kind: "text" } }],
  flags: [
    { description: "y", long: "yes", short: "y", value: { kind: "none" } },
  ],
  name: "rm",
  summary: "rm",
});
const serverSpec = defineGroup({
  aliases: ["servers"],
  default: "ls",
  name: "server",
  subcommands: [lsSpec, rmSpec],
  summary: "servers",
});
const switchSpec = defineCommand({
  args: [{ arity: "optional", name: "project", value: { kind: "project" } }],
  flags: [],
  name: "switch",
  summary: "switch",
});
const whoamiSpec = defineCommand({
  args: [],
  flags: [{ description: "j", long: "json", value: { kind: "none" } }],
  name: "whoami",
  summary: "whoami",
});
const envSpec = defineCommand({
  args: [],
  flags: [
    {
      description: "s",
      long: "shell",
      value: { choices: ["bash", "zsh", "fish"], kind: "choice" },
    },
  ],
  name: "env",
  summary: "env",
});
const loginSpec = defineCommand({
  args: [],
  flags: [
    {
      description: "u",
      long: "username",
      short: "u",
      value: { kind: "text", name: "email" },
    },
    {
      description: "p",
      long: "project",
      short: "p",
      value: { kind: "project" },
    },
  ],
  name: "login",
  summary: "login",
});
const completeSpec = defineCommand({
  args: [
    {
      arity: "one",
      name: "kind",
      value: { choices: ["projects", "profiles", "openstack"], kind: "choice" },
    },
    { arity: "rest", name: "words", value: { kind: "text" } },
  ],
  flags: [],
  name: "__complete",
  summary: "c",
  updateNotice: false,
});
const execSpec = definePassthrough({
  name: "exec",
  summary: "exec",
  target: { kind: "command" },
});
const osSpec = definePassthrough({
  aliases: ["openstack"],
  name: "os",
  summary: "os",
  target: { kind: "openstack" },
});

const spy: Program = {
  examples: [],
  hidden: [handle(completeSpec, recordLeaf("complete"))],
  sections: [
    {
      commands: [
        route(serverSpec, {
          ls: handle(lsSpec, recordLeaf("ls")),
          rm: handle(rmSpec, recordLeaf("rm")),
        }),
        handle(switchSpec, recordLeaf("switch")),
        handle(whoamiSpec, recordLeaf("whoami")),
        handle(envSpec, recordLeaf("env")),
        handle(loginSpec, recordLeaf("login")),
        forward(execSpec, recordPassthrough("exec")),
        forward(osSpec, recordPassthrough("os")),
      ],
      title: "All",
    },
  ],
  summary: "spy",
};

let lastGlobals: GlobalValues | null = null;
let out = "";
const fail = () => Promise.reject(new Error("no cloud in tests"));

const fakeClient = (input: { globals: GlobalValues }): Client => {
  lastGlobals = input.globals;
  return {
    cloud: fail,
    profile: fail,
    program: { examples: [], hidden: [], sections: [], summary: "" },
    prompts: {
      choice: fail,
      confirm: fail,
      interactive: false,
      secret: fail,
      text: fail,
    },
    savedSession: fail,
    session: fail,
    stdout: {
      isTTY: false,
      json: (v) => {
        out += JSON.stringify(v);
      },
      line: (t) => {
        out += `${t}\n`;
      },
      write: (t) => {
        out += t;
      },
    },
  };
};

const go = (argv: string[], program: Program = spy) => {
  seen.length = 0;
  lastGlobals = null;
  out = "";
  return run({ argv, createClient: fakeClient, program, version: "9.9.9" });
};

const usage = async (argv: string[], program: Program = spy) => {
  try {
    await go(argv, program);
  } catch (error) {
    if (error instanceof CliError) {
      return { code: error.exitCode, hint: error.hint, message: error.message };
    }
    throw error;
  }
  throw new Error(`no error for ${argv.join(" ")}`);
};

describe("dispatch", () => {
  test("globals before the command, the group and the subcommand, and flags after", async () => {
    await go(["-P", "staging", "server", "ls", "--json"]);
    expect(seen).toEqual([{ args: {}, flags: { json: true }, name: "ls" }]);
    expect(lastGlobals).toEqual({ profile: "staging" });
  });
  test("aliases", async () => {
    await go(["servers", "list"]);
    expect(seen).toEqual([{ args: {}, flags: {}, name: "ls" }]);
  });
  test("a bare noun runs its default, flags included", async () => {
    await go(["server"]);
    expect(seen).toEqual([{ args: {}, flags: {}, name: "ls" }]);
    await go(["server", "--json"]);
    expect(seen).toEqual([{ args: {}, flags: { json: true }, name: "ls" }]);
  });
  test("a global between the group and the subcommand", async () => {
    await go(["server", "-P", "x", "ls", "--json"]);
    expect(seen).toEqual([{ args: {}, flags: { json: true }, name: "ls" }]);
    expect(lastGlobals).toEqual({ profile: "x" });
  });
  test("arguments, short flags, arity errors", async () => {
    await go(["server", "rm", "web-1", "-y"]);
    expect(seen).toEqual([
      { args: { name: "web-1" }, flags: { yes: true }, name: "rm" },
    ]);
    expect(await usage(["server", "rm"])).toMatchObject({
      code: 2,
      hint: "Usage: nipa server rm <name> [--yes]",
      message: "missing <name>",
    });
    expect(await usage(["server", "rm", "a", "b"])).toMatchObject({
      code: 2,
      message: 'unexpected argument "b"',
    });
  });
  test("-- ends the options", async () => {
    await go(["switch", "--", "--help"]);
    expect(seen).toEqual([
      { args: { project: "--help" }, flags: {}, name: "switch" },
    ]);
    await go(["switch", "--", "-h"]);
    expect(seen).toEqual([
      { args: { project: "-h" }, flags: {}, name: "switch" },
    ]);
    await go(["__complete", "openstack", "--", "server", "list", "--"]);
    expect(seen).toEqual([
      {
        args: { kind: "openstack", words: ["server", "list", "--"] },
        flags: {},
        name: "complete",
      },
    ]);
  });
  test("globals after the command, inline values, last one wins", async () => {
    await go(["whoami", "--profile=prod"]);
    expect(lastGlobals).toEqual({ profile: "prod" });
    await go(["-P", "a", "whoami", "-P", "b", "--json"]);
    expect(lastGlobals).toEqual({ profile: "b" });
    expect(seen).toEqual([{ args: {}, flags: { json: true }, name: "whoami" }]);
    await go(["-d", "whoami"]);
    expect(lastGlobals).toEqual({ debug: true });
    await go(["whoami", "-dv"]);
    expect(seen).toHaveLength(1);
  });
  test("choices and values", async () => {
    await go(["env", "--shell", "fish"]);
    expect(seen).toEqual([{ args: {}, flags: { shell: "fish" }, name: "env" }]);
    await go(["env", "--shell=zsh"]);
    expect(seen).toEqual([{ args: {}, flags: { shell: "zsh" }, name: "env" }]);
    expect(await usage(["env", "--shell", "tcsh"])).toEqual({
      code: 2,
      hint: "Use one of: bash, zsh, fish.",
      message: 'unknown shell "tcsh"',
    });
    expect(await usage(["env", "--shell"])).toMatchObject({
      code: 2,
      message: "--shell needs <bash|zsh|fish>",
    });
    await go(["login", "-u", "a@b.c", "-p", "Beta"]);
    expect(seen).toEqual([
      {
        args: {},
        flags: { project: "Beta", username: "a@b.c" },
        name: "login",
      },
    ]);
    expect(await usage(["__complete", "nope"])).toEqual({
      code: 2,
      hint: "Use one of: projects, profiles, openstack.",
      message: 'unknown kind "nope"',
    });
  });
  test("passthrough words are untouched, --help included", async () => {
    await go(["exec", "sh", "-c", 'echo "$1"', "sh", "--help"]);
    expect(seen).toEqual([
      {
        args: ["-c", 'echo "$1"', "sh", "--help"],
        command: "sh",
        name: "exec",
      },
    ]);
    await go(["-P", "staging", "openstack", "server", "list", "-h"]);
    expect(seen).toEqual([
      { args: ["server", "list", "-h"], command: "openstack", name: "os" },
    ]);
    expect(lastGlobals).toEqual({ profile: "staging" });
    expect(await usage(["exec"])).toEqual({
      code: 2,
      hint: "Usage: nipa exec <command> [args...]",
      message: "missing <command>",
    });
  });
  test("usage errors", async () => {
    expect(await usage(["--nope"])).toMatchObject({
      code: 2,
      message: 'unknown option "--nope"',
    });
    expect(await usage(["whoami", "--nope"])).toMatchObject({
      code: 2,
      hint: "Run `nipa whoami --help` to see the options.",
    });
    expect(await usage(["-P"])).toMatchObject({
      code: 2,
      message: "-P needs <name>",
    });
    expect(await usage(["server", "nope"])).toEqual({
      code: 2,
      hint: "Use ls or rm.",
      message: 'unknown subcommand "server nope"',
    });
    expect(await usage(["logn"])).toMatchObject({
      code: 2,
      hint: "Did you mean `nipa login`?",
    });
  });
  test("update notice follows the spec", async () => {
    expect(await go(["whoami"])).toEqual({
      exitCode: 0,
      kind: "ran",
      updateNotice: true,
    });
    expect(await go(["__complete", "profiles"])).toEqual({
      exitCode: 0,
      kind: "ran",
      updateNotice: false,
    });
  });
});

/**
 * What nipa prints for help or the version, with the real command table.
 * picocolors turns colors on when CI is set, so the text loses them here.
 */
const text = async (argv: string[]) => {
  const outcome = await go(argv, realProgram);
  if (outcome.kind !== "print") {
    throw new Error(`${argv.join(" ")} ran a command instead of printing`);
  }
  return stripVTControlCharacters(outcome.text);
};

describe("help and version, on the real table", () => {
  test("version wins before the command", async () => {
    expect(await text(["--version"])).toBe("9.9.9");
    expect(await text(["-v", "whoami"])).toBe("9.9.9");
  });
  test("main help", async () => {
    expect(await text([])).toBe(await text(["--help"]));
    expect(await text(["help", "nope"])).toBe(await text(["--help"]));
  });
  test("help <command> is <command> --help, and help wins", async () => {
    const login = await text(["help", "login"]);
    expect(login).toContain("Usage: nipa login [options]");
    expect(await text(["login", "--help"])).toBe(login);
    expect(await text(["login", "-u", "--help"])).toBe(login);
    expect(await text(["whoami", "--nope", "--help"])).toBe(
      await text(["help", "whoami"])
    );
  });
  test("groups and subcommands", async () => {
    const server = await text(["help", "server"]);
    expect(server).toContain(
      "Usage: nipa server [ls|inspect|start|stop|restart]"
    );
    expect(server).toContain("stop <server> [options]");
    expect(server).toContain("--timeout <duration>");
    expect(await text(["server", "--help"])).toBe(server);
    expect(await text(["server", "nope", "--help"])).toBe(server);
    expect(await text(["--help", "server", "nope"])).toBe(server);
    expect(await text(["help", "servers"])).toBe(server);
    const rm = await text(["profile", "rm", "--help"]);
    expect(rm).toContain("Usage: nipa profile rm <name> [--yes]");
    expect(await text(["help", "profile", "rm"])).toBe(rm);
  });
  test("passthrough: nipa's page only before the command", async () => {
    expect(await text(["--help", "os"])).toContain("Usage: nipa os <args...>");
  });
});

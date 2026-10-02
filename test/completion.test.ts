// Completion scripts: syntax for every shell, and real Tab presses where the
// shell is installed (bash and fish locally; pwsh on the CI runner).

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { startFakeKeystone } from "./fake-keystone";
import type { FakeKeystone } from "./fake-keystone";
import {
  ENTRY,
  installNipaShim,
  runProcess,
  seedSession,
  testEnv,
} from "./helpers";

const SHELLS = ["bash", "zsh", "fish", "pwsh"] as const;

let dir: string;
let keystone: FakeKeystone;

const has = (shell: string): boolean => Bun.which(shell) !== null;

const shellRun = (cmd: string[]) => runProcess(cmd, testEnv(dir));

const nipa = (...args: string[]) =>
  runProcess(["bun", ENTRY, ...args], testEnv(dir));

/** PowerShell only dot-sources files that end in .ps1. */
const script = (shell: string): string =>
  path.join(dir, `completion.${shell === "pwsh" ? "ps1" : shell}`);

const lines = (text: string): string[] =>
  text.trim().split(/\r?\n/u).filter(Boolean);

/** Simulates a bash Tab press: COMP_WORDS is the line split into words. */
const bashComplete = async (...words: string[]) => {
  const quoted = words.map((w) => `'${w}'`).join(" ");
  const { stdout } = await shellRun([
    "bash",
    "-c",
    `source '${script("bash")}'; COMP_WORDS=(${quoted}); COMP_CWORD=${words.length - 1}; _nipa; printf '%s\\n' "\${COMPREPLY[@]}"`,
  ]);
  return lines(stdout);
};

const fishComplete = async (line: string) => {
  const { stdout } = await shellRun([
    "fish",
    "--no-config",
    "-c",
    `source '${script("fish")}'; complete -C '${line}'`,
  ]);
  return lines(stdout).map((l) => l.split("\t")[0]);
};

const pwshComplete = async (line: string) => {
  const { stdout } = await shellRun([
    "pwsh",
    "-NoProfile",
    "-Command",
    `. '${script("pwsh")}'; (TabExpansion2 -inputScript '${line}' -cursorColumn ${line.length}).CompletionMatches | ForEach-Object CompletionText`,
  ]);
  return lines(stdout);
};

const syntaxOk = async (cmd: string[]) => {
  const { code } = await shellRun(cmd);
  return code === 0;
};

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "nipa-completion-"));
  keystone = startFakeKeystone();
  await installNipaShim(dir);
  await seedSession(dir, keystone.url);
  await Promise.all(
    SHELLS.map(async (shell) => {
      const { stdout } = await nipa("completion", shell);
      await writeFile(script(shell), stdout);
    })
  );
});

afterAll(async () => {
  keystone.stop();
  await rm(dir, { force: true, recursive: true });
});

describe("nipa completion", () => {
  test("rejects an unknown shell", async () => {
    const { code, stderr } = await nipa("completion", "tcsh");
    expect(code).toBe(2);
    expect(stderr).toContain("bash, zsh, fish, pwsh");
  });

  test("__complete projects lists project names", async () => {
    const { stdout } = await nipa("__complete", "projects");
    expect(lines(stdout)).toEqual(["Alpha", "Beta"]);
  });

  test("hidden commands stay out of --help", async () => {
    const { stdout } = await nipa("--help");
    expect(stdout).not.toContain("__complete");
    expect(stdout).toContain("completion");
  });
});

describe("bash", () => {
  test("syntax", async () => {
    expect(await syntaxOk(["bash", "-n", script("bash")])).toBe(true);
  });

  test("commands", async () => {
    expect(await bashComplete("nipa", "lo")).toEqual(["login", "logout"]);
  });

  test("flags and flag values", async () => {
    expect(await bashComplete("nipa", "whoami", "--")).toEqual(["--json"]);
    expect(await bashComplete("nipa", "env", "--shell", "f")).toEqual(["fish"]);
  });

  test("switch lists projects from the session", async () => {
    expect(await bashComplete("nipa", "switch", "")).toEqual(["Alpha", "Beta"]);
  });
});

describe("zsh", () => {
  test("syntax", async () => {
    expect(await syntaxOk(["zsh", "-n", script("zsh")])).toBe(true);
  });

  test("registers _nipa for nipa when eval'd", async () => {
    // A stub compdef: a full compinit takes seconds on machines with a large $fpath.
    const { stdout } = await shellRun([
      "zsh",
      "-f",
      "-c",
      `compdef() { print -r -- "$2 -> $1"; }; source '${script("zsh")}'`,
    ]);
    expect(stdout.trim()).toBe("nipa -> _nipa");
  });
});

describe.if(has("fish"))("fish", () => {
  test("syntax", async () => {
    expect(await syntaxOk(["fish", "-n", script("fish")])).toBe(true);
  });

  test("commands with descriptions", async () => {
    expect(await fishComplete("nipa lo")).toEqual(["login", "logout"]);
  });

  test("switch lists projects from the session", async () => {
    expect(await fishComplete("nipa switch ")).toEqual(["Alpha", "Beta"]);
  });

  test("completion lists shells", async () => {
    expect(await fishComplete("nipa completion p")).toEqual(["pwsh"]);
  });
});

describe.if(has("pwsh"))("pwsh", () => {
  test("commands", async () => {
    expect(await pwshComplete("nipa lo")).toEqual(["login", "logout"]);
  });

  test("flags", async () => {
    expect(await pwshComplete("nipa whoami --")).toEqual(["--json"]);
  });

  test("switch lists projects from the session", async () => {
    expect(await pwshComplete("nipa switch ")).toEqual(["Alpha", "Beta"]);
  });
});

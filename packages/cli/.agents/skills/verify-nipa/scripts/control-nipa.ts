#!/usr/bin/env bun

// Drives nipa from source against the test suite's fake Keystone and Space API
// on localhost, with a throwaway HOME and config directory per run. It refuses
// any command that could reach a real cloud, a real keychain or an outside
// program. Evidence outlives `down`.
//
//   control-nipa.ts up      [--run <id>]
//   control-nipa.ts doctor  [--run <id>]
//   control-nipa.ts run     [--run <id>] -- <nipa args>
//   control-nipa.ts down    [--run <id>]
//
// NIPA_VERIFY_ROOT moves the runs and evidence (default $TMPDIR/nipa-verify).

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { ENTRY, seedSession } from "../../../../test/helpers";
import { installFakeKeychain } from "../../../../test/mocks/keychain";

interface RunState {
  id: string;
  pid: number;
  url: string;
  home: string;
  evidence: string;
  startedAt: string;
}

interface Result {
  code: number;
  stdout: string;
  stderr: string;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const OUTSIDE_PROGRAMS = new Set(["os", "tf", "exec", "open"]);
const GLOBALS_WITH_VALUE = new Set(["-P", "--profile", "-p", "--project"]);
const READY_TIMEOUT_MS = 10_000;
const RUN_ID = /^[\w-]+$/u;
const TOKEN_FIELD = /"token":"(?<token>[^"]+)"/gu;
const URL_IN_ARG = /https?:\/\/[^\s'"]+/giu;

const root = process.env.NIPA_VERIFY_ROOT ?? path.join(tmpdir(), "nipa-verify");
const pkgVersion: string = JSON.parse(
  readFileSync(path.join(path.dirname(ENTRY), "..", "package.json"), "utf-8")
).version;

const fail = (message: string): never => {
  process.stderr.write(`control-nipa: ${message}\n`);
  process.exit(1);
};

const parseCli = (argv: string[]) => {
  const dash = argv.indexOf("--");
  const own = dash === -1 ? argv : argv.slice(0, dash);
  const rest = dash === -1 ? [] : argv.slice(dash + 1);
  const runAt = own.indexOf("--run");
  const id = runAt === -1 ? "default" : (own[runAt + 1] ?? "");
  if (!RUN_ID.test(id)) {
    fail("--run takes a name of letters, digits, - and _");
  }
  return { action: own[0], id, rest };
};

const runDir = (id: string) => path.join(root, "runs", id);
const statePath = (id: string) => path.join(runDir(id), "state.json");

const readState = (id: string): RunState | undefined =>
  existsSync(statePath(id))
    ? JSON.parse(readFileSync(statePath(id), "utf-8"))
    : undefined;

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const isLoopback = (url: string): boolean => {
  try {
    return LOOPBACK.has(new URL(url).hostname);
  } catch {
    return false;
  }
};

/** Every URL a profile in the run's config.json names, legacy shape included. */
const configUrls = (home: string): string[] => {
  const file = path.join(home, "config.json");
  if (!existsSync(file)) {
    return [];
  }
  const config = JSON.parse(readFileSync(file, "utf-8"));
  const profiles = [config, ...Object.values(config.profiles ?? {})];
  return profiles.flatMap((profile) =>
    [profile.authUrl, profile.spaceUrl].filter(
      (url): url is string => typeof url === "string"
    )
  );
};

/** The first argument that isn't an option or a global option's value. */
const commandWord = (args: string[]): string | undefined => {
  let skipNext = false;
  for (const arg of args) {
    if (skipNext) {
      skipNext = false;
    } else if (GLOBALS_WITH_VALUE.has(arg)) {
      skipNext = true;
    } else if (!arg.startsWith("-")) {
      return arg;
    }
  }
  return undefined;
};

/** Why these args must not run in this run, or undefined when they may. */
const refusal = (args: string[], home: string): string | undefined => {
  const offProfile = configUrls(home).find((url) => !isLoopback(url));
  if (offProfile) {
    return `the run's config names ${offProfile}, which isn't localhost. Run \`down\` and \`up\` again.`;
  }
  const offArg = args
    .flatMap((arg) => arg.match(URL_IN_ARG) ?? [])
    .find((url) => !isLoopback(url));
  if (offArg) {
    return `${offArg} isn't localhost. Only the fake cloud of this run may be reached.`;
  }
  const word = commandWord(args);
  if (word && OUTSIDE_PROGRAMS.has(word)) {
    return `\`nipa ${word}\` hands its arguments, --help included, to an outside program (openstack, terraform, a shell or a browser). Read \`nipa --help\` instead.`;
  }
  return undefined;
};

const cleanEnv = (state: RunState) => ({
  HOME: state.home,
  NIPA_CONFIG_DIR: state.home,
  NIPA_NO_UPDATE_CHECK: "1",
  NO_COLOR: "1",
  PATH: `${path.join(state.home, "bin")}:${process.env.PATH ?? ""}`,
  TMPDIR: tmpdir(),
  XDG_CACHE_HOME: path.join(state.home, ".cache"),
  XDG_CONFIG_HOME: path.join(state.home, ".config"),
});

const redact = (text: string, home: string): string => {
  const file = path.join(home, "auth.json");
  if (!existsSync(file)) {
    return text;
  }
  let out = text;
  for (const match of readFileSync(file, "utf-8").matchAll(TOKEN_FIELD)) {
    const token = match.groups?.token;
    if (token) {
      out = out.replaceAll(token, "<redacted-token>");
    }
  }
  return out;
};

const nipa = async (state: RunState, args: string[]): Promise<Result> => {
  const proc = Bun.spawn(["bun", ENTRY, ...args], {
    env: cleanEnv(state),
    stderr: "pipe",
    stdin: "ignore",
    stdout: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return {
    code,
    stderr: redact(stderr, state.home),
    stdout: redact(stdout, state.home),
  };
};

const record = (state: RunState, args: string[], result: Result): string => {
  mkdirSync(state.evidence, { recursive: true });
  const indexFile = path.join(state.evidence, "index.tsv");
  const index = existsSync(indexFile)
    ? readFileSync(indexFile, "utf-8").split("\n").filter(Boolean).length
    : 0;
  const command = `nipa ${args.join(" ")}`;
  const slug =
    args
      .join("-")
      .replaceAll(/[^\w-]+/gu, "")
      .slice(0, 48) || "bare";
  const number = String(index + 1).padStart(2, "0");
  const file = path.join(state.evidence, `${number}-${slug}.txt`);
  writeFileSync(
    file,
    [
      `$ ${command}`,
      `exit: ${result.code}`,
      "--- stdout",
      result.stdout,
      "--- stderr",
      result.stderr,
    ].join("\n")
  );
  const row = [
    new Date().toISOString(),
    result.code,
    path.basename(file),
    command,
  ];
  appendFileSync(indexFile, `${row.join("\t")}\n`);
  return file;
};

const requireState = (id: string): RunState => {
  const state = readState(id);
  if (!(state && isAlive(state.pid))) {
    return fail(`run ${id} isn't up. Run \`control-nipa.ts up --run ${id}\`.`);
  }
  return state;
};

const waitForUrl = async (file: string, deadline: number): Promise<string> => {
  if (existsSync(file)) {
    return readFileSync(file, "utf-8");
  }
  if (Date.now() > deadline) {
    return fail(`the fake cloud wrote no URL to ${file} in 10s`);
  }
  await Bun.sleep(50);
  return waitForUrl(file, deadline);
};

const answers = async (url: string): Promise<boolean> => {
  try {
    const res = await fetch(url);
    return res.status < 500;
  } catch {
    return false;
  }
};

const up = async (id: string): Promise<number> => {
  const existing = readState(id);
  if (existing && isAlive(existing.pid)) {
    process.stdout.write(`ready ${id} ${existing.url} (already up)\n`);
    return 0;
  }
  rmSync(runDir(id), { force: true, recursive: true });
  const home = path.join(runDir(id), "home");
  mkdirSync(home, { recursive: true });
  const urlFile = path.join(runDir(id), "url");
  const log = Bun.file(path.join(runDir(id), "fake-cloud.log"));
  const server = Bun.spawn(
    ["bun", path.join(import.meta.dir, "fake-cloud.ts"), urlFile],
    { stderr: log, stdin: "ignore", stdout: log }
  );
  server.unref();
  const url = await waitForUrl(urlFile, Date.now() + READY_TIMEOUT_MS);
  await seedSession(home, url);
  await installFakeKeychain(home);
  const state: RunState = {
    evidence: path.join(root, "evidence", id),
    home,
    id,
    pid: server.pid,
    startedAt: new Date().toISOString(),
    url,
  };
  writeFileSync(statePath(id), JSON.stringify(state, null, 2));
  process.stdout.write(
    `ready ${id} ${url}\nhome ${home}\nevidence ${state.evidence}\n`
  );
  return 0;
};

const doctor = async (id: string): Promise<number> => {
  const state = readState(id);
  const checks: [string, boolean, string][] = [
    ["state", state !== undefined, statePath(id)],
  ];
  if (state) {
    const blocked = refusal([], state.home);
    const keychain = Bun.which("security", { PATH: cleanEnv(state).PATH });
    const version = await nipa(state, ["--version"]);
    checks.push(
      ["fake cloud pid", isAlive(state.pid), String(state.pid)],
      ["url is localhost", isLoopback(state.url), state.url],
      ["fake cloud answers", await answers(`${state.url}/v3`), state.url],
      ["profiles are localhost", !blocked, blocked ?? "config.json"],
      [
        "keychain is the fake",
        keychain === path.join(state.home, "bin", "security"),
        keychain ?? "none",
      ],
      [
        "nipa from source",
        version.code === 0 && version.stdout.trim() === pkgVersion,
        version.stdout.trim(),
      ]
    );
  }
  for (const [name, ok, detail] of checks) {
    process.stdout.write(`${ok ? "ok  " : "FAIL"} ${name}: ${detail}\n`);
  }
  return checks.every(([, ok]) => ok) ? 0 : 1;
};

const run = async (id: string, args: string[]): Promise<number> => {
  const state = requireState(id);
  const why = refusal(args, state.home);
  if (why) {
    return fail(`refused: ${why}`);
  }
  const result = await nipa(state, args);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  const file = record(state, args, result);
  // The config may change during the command, as `profile add` does.
  const after = refusal([], state.home);
  if (after) {
    process.stderr.write(`control-nipa: ${after}\n`);
  }
  process.stderr.write(`control-nipa: exit ${result.code}, evidence ${file}\n`);
  return result.code;
};

const down = (id: string): number => {
  const state = readState(id);
  if (state && isAlive(state.pid)) {
    process.kill(state.pid, "SIGTERM");
  }
  rmSync(runDir(id), { force: true, recursive: true });
  const evidence = state?.evidence ?? path.join(root, "evidence", id);
  const kept = existsSync(evidence) ? `, evidence kept in ${evidence}` : "";
  process.stdout.write(`down ${id}${kept}\n`);
  return 0;
};

const main = (
  action: string | undefined,
  id: string,
  rest: string[]
): Promise<number> | number => {
  switch (action) {
    case "up": {
      return up(id);
    }
    case "doctor": {
      return doctor(id);
    }
    case "run": {
      return run(id, rest);
    }
    case "down": {
      return down(id);
    }
    default: {
      return fail(
        "usage: control-nipa.ts up|doctor|run|down [--run <id>] [-- <nipa args>]"
      );
    }
  }
};

if (import.meta.main) {
  const { action, id, rest } = parseCli(process.argv.slice(2));
  process.exit(await main(action, id, rest));
}

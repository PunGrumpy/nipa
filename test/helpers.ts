// Shared setup for tests that run nipa as a process.

import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { FAKE_USER } from "./fake-keystone";

export const ENTRY = path.join(import.meta.dir, "..", "src", "index.ts");

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs a command and collects its output; stdin is closed, like a script. */
export const runProcess = async (
  cmd: string[],
  env: Record<string, string>
): Promise<RunResult> => {
  const proc = Bun.spawn(cmd, {
    env,
    stderr: "pipe",
    stdin: "ignore",
    stdout: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stderr, stdout };
};

/** The environment a test process sees: a private HOME and config dir, no colors. */
export const testEnv = (dir: string) => ({
  HOME: dir,
  NIPA_CONFIG_DIR: dir,
  NO_COLOR: "1",
  PATH: `${path.join(dir, "bin")}:${process.env.PATH ?? ""}`,
});

/** Puts a `nipa` wrapper on the test PATH, for completion scripts that call `nipa __complete`. */
export const installNipaShim = async (dir: string): Promise<void> => {
  const bin = path.join(dir, "bin");
  await mkdir(bin, { recursive: true });
  const shim = path.join(bin, "nipa");
  await writeFile(shim, `#!/bin/sh\nexec bun "${ENTRY}" "$@"\n`);
  await chmod(shim, 0o755);
};

/** A session as `nipa login` would save it, with a real token from the fake Keystone. */
export const seedSession = async (
  dir: string,
  keystoneUrl: string
): Promise<void> => {
  const res = await fetch(`${keystoneUrl}/v3/auth/tokens`, {
    body: JSON.stringify({
      auth: {
        identity: {
          methods: ["password", "totp"],
          password: { user: { name: FAKE_USER.name, password: "secret" } },
          totp: { user: { passcode: "123456" } },
        },
        scope: { project: { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } },
      },
    }),
    method: "POST",
  });
  const token = res.headers.get("X-Subject-Token") ?? "";
  await writeFile(
    path.join(dir, "config.json"),
    JSON.stringify({ authUrl: keystoneUrl, username: FAKE_USER.name })
  );
  await writeFile(
    path.join(dir, "auth.json"),
    JSON.stringify({
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      project: {
        domainId: "d1",
        id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        name: "Alpha",
      },
      token,
      user: FAKE_USER,
    })
  );
};

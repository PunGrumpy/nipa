import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { requireKeychain, systemKeychain } from "../../../src/util/keychain";
import { installFakeKeychain, readFakeKeychain } from "../../mocks/keychain";

let dir: string;
const saved = { HOME: process.env.HOME, PATH: process.env.PATH };

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "nipa-keychain-"));
  await installFakeKeychain(dir);
  // The fakes keep their passwords under HOME, and nipa finds them on PATH.
  process.env.HOME = dir;
  process.env.PATH = `${path.join(dir, "bin")}${path.delimiter}${saved.PATH}`;
});

afterAll(async () => {
  process.env.HOME = saved.HOME;
  process.env.PATH = saved.PATH;
  await rm(dir, { force: true, recursive: true });
});

// Each call starts the fake tool, a bun process, so a round trip takes seconds.
const TOOL_TIMEOUT_MS = 30_000;

const entry = {
  authUrl: "https://keystone.example.com/v3",
  username: "me@example.com",
};

describe.each(["darwin", "linux"] as const)(
  "systemKeychain on %s",
  (platform) => {
    test(
      "saves, reads and deletes a password without it on a command line",
      async () => {
        const keychain = systemKeychain(platform);
        if (!keychain) {
          throw new Error("no keychain");
        }
        // Quotes, $ and Thai, which `security -w` would print as hex.
        const password = `p@ss "w0rd" $x รหัส ${platform}`;
        await keychain.save(entry, password);
        expect(await keychain.read(entry)).toBe(password);
        const stored = await readFakeKeychain(dir);
        expect(Object.keys(stored)).toEqual([
          "nipa-cli/keystone.example.com|me@example.com",
        ]);
        expect(await keychain.remove(entry)).toBe(true);
        expect(await keychain.read(entry)).toBeUndefined();
        expect(await keychain.remove(entry)).toBe(false);
      },
      TOOL_TIMEOUT_MS
    );
  }
);

describe("requireKeychain", () => {
  test("names what to install, or says where nipa saves passwords", () => {
    expect(() => requireKeychain("win32")).toThrow(
      "nipa can't save your password on win32"
    );
    const pathBefore = process.env.PATH;
    process.env.PATH = "";
    try {
      expect(() => requireKeychain("linux")).toThrow(
        expect.objectContaining({
          hint: expect.stringContaining("sudo apt install libsecret-tools"),
        })
      );
    } finally {
      process.env.PATH = pathBefore;
    }
  });
});

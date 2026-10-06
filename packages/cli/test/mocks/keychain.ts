// A fake of macOS's `security` and Linux's `secret-tool`, so tests never
// touch a real keychain. Both keep passwords in $HOME/fake-keychain.json,
// keyed "service|account", whichever tool saved them.

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const FAKE = `#!/usr/bin/env bun
const fs = require("node:fs");
const path = require("node:path");
const file = path.join(process.env.HOME, "fake-keychain.json");
const db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
const save = () => fs.writeFileSync(file, JSON.stringify(db));
const stdin = () => fs.readFileSync(0, "utf8");
const tool = path.basename(process.argv[1]);
let args = process.argv.slice(2);
if (tool === "security") {
  if (args[0] === "-i") args = stdin().trim().split(" ");
  const get = (flag) => args[args.indexOf(flag) + 1];
  const key = get("-s") + "|" + get("-a");
  if (args[0] === "add-generic-password") {
    db[key] = Buffer.from(get("-X"), "hex").toString("utf8");
    save();
  } else if (args[0] === "find-generic-password") {
    if (!(key in db)) process.exit(44);
    // Like the real tool, -w prints data that isn't plain ASCII as hex.
    const data = db[key];
    const plain = /^[\\x20-\\x7e]*$/.test(data);
    process.stdout.write((plain ? data : Buffer.from(data).toString("hex")) + "\\n");
  } else if (args[0] === "delete-generic-password") {
    if (!(key in db)) process.exit(44);
    delete db[key];
    save();
  }
} else {
  const words = args.slice(1).filter((word) => !word.startsWith("--"));
  const key = words[words.indexOf("service") + 1] + "|" + words[words.indexOf("account") + 1];
  if (args[0] === "store") {
    db[key] = stdin();
    save();
  } else if (args[0] === "lookup") {
    if (!(key in db)) process.exit(1);
    process.stdout.write(db[key]);
  } else if (args[0] === "clear") {
    delete db[key];
    save();
  }
}
`;

/** Puts the fake `security` and `secret-tool` in `dir`/bin. */
export const installFakeKeychain = async (dir: string): Promise<void> => {
  const bin = path.join(dir, "bin");
  await mkdir(bin, { recursive: true });
  await Promise.all(
    ["security", "secret-tool"].map(async (tool) => {
      const file = path.join(bin, tool);
      await writeFile(file, FAKE);
      await chmod(file, 0o755);
    })
  );
};

const dbFile = (dir: string) => path.join(dir, "fake-keychain.json");

/** The saved passwords, keyed "service|account". */
export const readFakeKeychain = async (
  dir: string
): Promise<Record<string, string>> => {
  try {
    return JSON.parse(await readFile(dbFile(dir), "utf-8"));
  } catch {
    return {};
  }
};

export const writeFakeKeychain = (
  dir: string,
  passwords: Record<string, string>
): Promise<void> => writeFile(dbFile(dir), JSON.stringify(passwords));

/** The key nipa saves a Keystone user's password under. */
export const keychainKey = (authUrl: string, username: string): string =>
  `nipa-cli/${new URL(authUrl).host}|${username}`;

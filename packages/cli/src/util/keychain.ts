// The OS's own tools need no native module on Bun or Node. A password goes
// on stdin, never on a command line, where `ps` would show it.

import { spawn } from "node:child_process";
import { once } from "node:events";
import { text as readText } from "node:stream/consumers";

import { findCommand } from "./env";
import { CliError } from "./ui";

export interface KeychainEntry {
  authUrl: string;
  username: string;
}

export interface Keychain {
  readonly name: string;
  readonly read: (entry: KeychainEntry) => Promise<string | undefined>;
  readonly save: (entry: KeychainEntry, password: string) => Promise<void>;
  /** Says whether there was a password to delete. */
  readonly remove: (entry: KeychainEntry) => Promise<boolean>;
}

interface Result {
  code: number | null;
  stdout: string;
}

const run = async (
  bin: string,
  args: readonly string[],
  stdin = ""
): Promise<Result> => {
  const child = spawn(bin, args, { stdio: ["pipe", "pipe", "ignore"] });
  child.stdin.end(stdin);
  const [stdout] = await Promise.all([
    readText(child.stdout),
    once(child, "close"),
  ]);
  return { code: child.exitCode, stdout };
};

const service = (entry: KeychainEntry): string =>
  `nipa-cli/${new URL(entry.authUrl).host}`;

const failedSave = (name: string, check: string): CliError =>
  new CliError(`the ${name} didn't save your password`, {
    hint: `${check}, or log in without \`--remember\`.`,
  });

const macIds = (entry: KeychainEntry): string[] => [
  "-s",
  service(entry),
  "-a",
  entry.username,
];

// -X takes hex, so no quoting breaks the command. `security -w` prints a
// password that isn't plain ASCII as hex, so nipa saves it as base64.
const macKeychain = (bin: string): Keychain => {
  const name = "macOS Keychain";
  return {
    name,
    read: async (entry) => {
      const { code, stdout } = await run(bin, [
        "find-generic-password",
        ...macIds(entry),
        "-w",
      ]);
      return code === 0
        ? Buffer.from(stdout.trim(), "base64").toString("utf-8")
        : undefined;
    },
    remove: async (entry) => {
      const { code } = await run(bin, [
        "delete-generic-password",
        ...macIds(entry),
      ]);
      return code === 0;
    },
    save: async (entry, password) => {
      const encoded = Buffer.from(password, "utf-8").toString("base64");
      const hex = Buffer.from(encoded, "ascii").toString("hex");
      const command = [
        "add-generic-password",
        "-U",
        ...macIds(entry),
        "-X",
        hex,
      ];
      const { code } = await run(bin, ["-i"], `${command.join(" ")}\n`);
      if (code !== 0) {
        throw failedSave(name, "Check that your login keychain is unlocked");
      }
    },
  };
};

const linuxIds = (entry: KeychainEntry): string[] => [
  "service",
  service(entry),
  "account",
  entry.username,
];

const linuxKeychain = (bin: string): Keychain => {
  const name = "secret service";
  return {
    name,
    read: async (entry) => {
      const { code, stdout } = await run(bin, ["lookup", ...linuxIds(entry)]);
      return code === 0 && stdout !== "" ? stdout : undefined;
    },
    remove: async (entry) => {
      const found = await run(bin, ["lookup", ...linuxIds(entry)]);
      await run(bin, ["clear", ...linuxIds(entry)]);
      return found.code === 0;
    },
    save: async (entry, password) => {
      const label = `nipa password for ${entry.username}`;
      const args = ["store", `--label=${label}`, ...linuxIds(entry)];
      const { code } = await run(bin, args, password);
      if (code !== 0) {
        throw failedSave(
          name,
          "Check that a secret service, such as GNOME Keyring, is running"
        );
      }
    },
  };
};

export const systemKeychain = (
  platform: NodeJS.Platform = process.platform
): Keychain | undefined => {
  if (platform === "darwin") {
    const bin = findCommand("security");
    return bin ? macKeychain(bin) : undefined;
  }
  if (platform === "linux") {
    const bin = findCommand("secret-tool");
    return bin ? linuxKeychain(bin) : undefined;
  }
  return undefined;
};

export const requireKeychain = (
  platform: NodeJS.Platform = process.platform
): Keychain => {
  const keychain = systemKeychain(platform);
  if (keychain) {
    return keychain;
  }
  const hint =
    platform === "linux"
      ? "Install secret-tool, such as with `sudo apt install libsecret-tools`, or log in without `--remember`."
      : "Log in without `--remember`. nipa saves passwords on macOS and Linux.";
  throw new CliError(`nipa can't save your password on ${platform}`, {
    hint,
  });
};

export const forgetPassword = (profile: {
  authUrl: string;
  username?: string;
}): Promise<boolean> => {
  const keychain = systemKeychain();
  if (!(keychain && profile.username)) {
    return Promise.resolve(false);
  }
  return keychain.remove({
    authUrl: profile.authUrl,
    username: profile.username,
  });
};

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { findCommand } from "../../../src/util/env";
import { requireSession, resolveProfile } from "../../../src/util/session";
import { loadConfig, loadSession } from "../../../src/util/store";
import type { Prompts } from "../../../src/util/ui";
import { CliError } from "../../../src/util/ui";
import { seedSession } from "../../helpers";
import { installFakeKeychain } from "../../mocks/keychain";
import {
  ALPHA_ID,
  BETA_ID,
  FAKE_PASSCODE,
  FAKE_PASSWORD,
  FAKE_USER,
  startFakeKeystone,
} from "../../mocks/keystone";
import type { FakeKeystone } from "../../mocks/keystone";

// A session that expired, a login nipa can prompt for, and a project named by
// --project: the login saves the saved project, and the run uses the other.

let dir: string;
let keystone: FakeKeystone;
const saved = { NIPA_CONFIG_DIR: "", PATH: "" };

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "nipa-expired-"));
  keystone = startFakeKeystone({ gateway: true });
  // The login looks for a keychain on PATH, so it gets the fake one, never the real one.
  await installFakeKeychain(dir);
  saved.NIPA_CONFIG_DIR = process.env.NIPA_CONFIG_DIR ?? "";
  saved.PATH = process.env.PATH ?? "";
  process.env.NIPA_CONFIG_DIR = dir;
  process.env.PATH = `${path.join(dir, "bin")}:${saved.PATH}`;
});

afterAll(async () => {
  keystone.stop();
  process.env.PATH = saved.PATH;
  if (saved.NIPA_CONFIG_DIR) {
    process.env.NIPA_CONFIG_DIR = saved.NIPA_CONFIG_DIR;
  } else {
    delete process.env.NIPA_CONFIG_DIR;
  }
  await rm(dir, { force: true, recursive: true });
});

// No -P on the line.
const noFlag = { profile: process.env.NIPA_PROFILE };

const expire = async (): Promise<void> => {
  await seedSession(dir, keystone.url);
  const file = path.join(dir, "auth.json");
  const auth = JSON.parse(await readFile(file, "utf-8"));
  auth.sessions.prod.expiresAt = new Date(Date.now() - 60_000).toISOString();
  await writeFile(file, JSON.stringify(auth));
};

const prompts = (interactive: boolean) => {
  const asked: string[] = [];
  const answer = (message: string): string => {
    asked.push(message);
    switch (message) {
      case "Email": {
        return FAKE_USER.name;
      }
      case "Password": {
        return FAKE_PASSWORD;
      }
      case "OTP code": {
        return FAKE_PASSCODE;
      }
      default: {
        throw new Error(`unexpected prompt: ${message}`);
      }
    }
  };
  const fake: Prompts = {
    choice: () => Promise.reject(new Error("unexpected choice")),
    confirm: () => Promise.reject(new Error("unexpected confirm")),
    interactive,
    secret: (message) => Promise.resolve(answer(message)),
    text: ({ message }) => Promise.resolve(answer(message)),
  };
  return { asked, fake };
};

describe("an expired session with --project", () => {
  test("logs in to the saved project, runs in the named one, and the saved one stays", async () => {
    // The one nipa looks up, which reads PATH on each call.
    expect(findCommand("security")).toStartWith(dir);
    await expire();
    const { asked, fake } = prompts(true);
    const active = await resolveProfile({ override: noFlag.profile });
    const signedIn = await requireSession({
      active,
      project: "Beta",
      prompts: fake,
    });
    expect(asked).toEqual(["Email", "Password", "OTP code"]);
    expect(signedIn.session.project).toMatchObject({
      id: BETA_ID,
      name: "Beta",
    });
    const session = await loadSession("prod");
    const config = await loadConfig();
    expect(session?.project.id).toBe(ALPHA_ID);
    expect(config.profiles.prod?.project?.id).toBe(ALPHA_ID);
  });

  test("without a terminal, it fails with token_expired and the login command", async () => {
    await expire();
    const { asked, fake } = prompts(false);
    const active = await resolveProfile({ override: noFlag.profile });
    let failure: unknown;
    try {
      await requireSession({ active, project: "Beta", prompts: fake });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(CliError);
    expect(failure).toMatchObject({
      hint: "Run `nipa login`.",
      message: "your prod session expired",
      next: ["nipa login"],
      reason: "token_expired",
    });
    expect(asked).toEqual([]);
    const after = await loadSession("prod");
    expect(after?.project.id).toBe(ALPHA_ID);
  });
});

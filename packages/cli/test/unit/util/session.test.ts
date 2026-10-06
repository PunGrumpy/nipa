import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import type { Keychain } from "../../../src/util/keychain";
import { authenticate } from "../../../src/util/session";
import type { LoginPrompts } from "../../../src/util/session";
import type { Profile } from "../../../src/util/store";
import {
  ALPHA_ID,
  FAKE_PASSCODE,
  FAKE_PASSWORD,
  FAKE_USER,
  PLAIN_USER,
  startFakeKeystone,
} from "../../mocks/keystone";
import type { FakeKeystone } from "../../mocks/keystone";

let keystone: FakeKeystone;
let profile: Profile;

beforeAll(() => {
  keystone = startFakeKeystone({ gateway: true });
  profile = {
    authUrl: keystone.url,
    region: "NCP-TH",
    spaceUrl: `${keystone.url}/api`,
    userDomain: "nipacloud",
  };
});

afterAll(() => {
  keystone.stop();
});

const answers = (input: { email?: string; codes?: string[] }) => {
  const asked: string[] = [];
  const codes = [...(input.codes ?? [])];
  const prompts: LoginPrompts = {
    email: (previous) => {
      asked.push(`email (default ${previous ?? "none"})`);
      return Promise.resolve(input.email ?? FAKE_USER.name);
    },
    otp: (attempt) => {
      asked.push(`otp ${attempt}`);
      return Promise.resolve(codes.shift() ?? FAKE_PASSCODE);
    },
    password: () => {
      asked.push("password");
      return Promise.resolve(FAKE_PASSWORD);
    },
    projectId: () => {
      asked.push("project ID");
      return Promise.resolve(ALPHA_ID);
    },
  };
  return { asked, prompts };
};

describe("authenticate", () => {
  test("first MFA login: email, project ID, password, then OTP code", async () => {
    const { asked, prompts } = answers({});
    const session = await authenticate({ profile, prompts });
    expect(asked).toEqual([
      "email (default none)",
      "project ID",
      "password",
      "otp 1",
    ]);
    expect(session.project.name).toBe("Alpha");
    expect(session.user).toEqual(FAKE_USER);
  });

  test("account without MFA: no OTP prompt", async () => {
    const { asked, prompts } = answers({ email: PLAIN_USER.name });
    const session = await authenticate({ profile, prompts });
    expect(asked).not.toContain("otp 1");
    expect(session.user).toEqual(PLAIN_USER);
  });

  test("the last project is scoped in the login request, without a project prompt", async () => {
    const { asked, prompts } = answers({});
    const last: Profile = {
      ...profile,
      project: { id: ALPHA_ID, name: "Alpha" },
      username: FAKE_USER.name,
    };
    const session = await authenticate({ profile: last, prompts });
    expect(asked).toEqual([
      `email (default ${FAKE_USER.name})`,
      "password",
      "otp 1",
    ]);
    expect(session.project.name).toBe("Alpha");
  });

  test("--project by ID skips the project ID prompt", async () => {
    const { asked, prompts } = answers({});
    const session = await authenticate({
      profile,
      prompts,
      username: FAKE_USER.name,
      wantedProject: ALPHA_ID,
    });
    expect(asked).toEqual(["password", "otp 1"]);
    expect(session.project.name).toBe("Alpha");
  });

  test("--project by name logs in to the last project, then switches", async () => {
    const { asked, prompts } = answers({});
    const last: Profile = {
      ...profile,
      project: { id: ALPHA_ID, name: "Alpha" },
    };
    const session = await authenticate({
      profile: last,
      prompts,
      username: FAKE_USER.name,
      wantedProject: "Beta",
    });
    expect(asked).toEqual(["password", "otp 1"]);
    expect(session.project.name).toBe("Beta");
  });

  test("--project by name on a first login still asks for a project ID", async () => {
    const { asked, prompts } = answers({});
    const session = await authenticate({
      profile,
      prompts,
      username: FAKE_USER.name,
      wantedProject: "Beta",
    });
    expect(asked).toEqual(["project ID", "password", "otp 1"]);
    expect(session.project.name).toBe("Beta");
  });

  test("a wrong OTP code asks for the next one", async () => {
    const { asked, prompts } = answers({ codes: ["000000", FAKE_PASSCODE] });
    await authenticate({ profile, prompts });
    expect(asked.filter((a) => a.startsWith("otp"))).toEqual([
      "otp 1",
      "otp 2",
    ]);
  });

  test("three wrong codes give up", async () => {
    const { prompts } = answers({ codes: ["000000", "000000", "000000"] });
    await expect(authenticate({ profile, prompts })).rejects.toThrow(
      "wrong OTP code"
    );
  });

  test("an unknown --project lists the real ones", async () => {
    const { prompts } = answers({});
    const attempt = authenticate({
      profile,
      prompts,
      username: PLAIN_USER.name,
      wantedProject: "Nope",
    });
    await expect(attempt).rejects.toThrow('no project named or with ID "Nope"');
  });
});

/** The profile after a first login: nipa knows the user and project. */
const known = (): Profile => ({
  ...profile,
  project: { id: ALPHA_ID, name: "Alpha" },
  username: FAKE_USER.name,
});

/** A keychain in memory, keyed by user. */
const memoryKeychain = (saved: Record<string, string> = {}) => {
  const passwords = new Map(Object.entries(saved));
  const keychain: Keychain = {
    name: "test keychain",
    read: (entry) => Promise.resolve(passwords.get(entry.username)),
    remove: (entry) => Promise.resolve(passwords.delete(entry.username)),
    save: (entry, password) => {
      passwords.set(entry.username, password);
      return Promise.resolve();
    },
  };
  return { keychain, passwords };
};

describe("authenticate with a keychain", () => {
  test("--remember saves the password once Keystone takes it", async () => {
    const { prompts } = answers({});
    const { keychain, passwords } = memoryKeychain();
    await authenticate({ keychain, profile: known(), prompts, remember: true });
    expect(passwords.get(FAKE_USER.name)).toBe(FAKE_PASSWORD);
  });

  test("a saved password leaves only the OTP code to ask", async () => {
    const { asked, prompts } = answers({});
    const { keychain } = memoryKeychain({ [FAKE_USER.name]: FAKE_PASSWORD });
    const session = await authenticate({ keychain, profile: known(), prompts });
    expect(asked).toEqual(["otp 1"]);
    expect(session.user.name).toBe(FAKE_USER.name);
  });

  test("a saved password Keystone refuses is deleted, then nipa asks", async () => {
    const { asked, prompts } = answers({});
    const { keychain, passwords } = memoryKeychain({
      [FAKE_USER.name]: "old password",
    });
    const session = await authenticate({ keychain, profile: known(), prompts });
    expect(asked).toEqual(["password", "otp 1"]);
    expect(passwords.has(FAKE_USER.name)).toBe(false);
    expect(session.project.id).toBe(ALPHA_ID);
  });

  test("without --remember, nothing is saved", async () => {
    const { prompts } = answers({});
    const { keychain, passwords } = memoryKeychain();
    await authenticate({ keychain, profile: known(), prompts });
    expect(passwords.size).toBe(0);
  });
});

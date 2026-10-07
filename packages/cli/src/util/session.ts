// How nipa gets and keeps a session: which profile a run uses, logging in
// with a password and an OTP code, scoping to a project, and reaching
// Nipa Cloud's Space API with the token. Handlers reach it through the client
// (`client.profile()`, `client.session()`, `client.cloud()`). The login and
// switch commands also call interactiveLogin, pickProject and saveLogin.

import { ApiError, createSpace } from "./api";
import type { Space } from "./api";
import { NetworkError } from "./http";
import { requireKeychain, systemKeychain } from "./keychain";
import type { Keychain } from "./keychain";
import {
  continueWithTotp,
  KeystoneError,
  listProjects,
  loginWithPassword,
  rescope,
} from "./keystone";
import type { Account, Project, Token } from "./keystone";
import { displayPath } from "./link";
import type { FoundLink } from "./link";
import {
  DEFAULT_PROFILE,
  isActive,
  loadConfig,
  loadSession,
  msUntilExpiry,
  saveConfig,
  saveSession,
} from "./store";
import type { Config, Profile, Session } from "./store";
import {
  bold,
  CliError,
  dim,
  formatDuration,
  log,
  note,
  success,
  withSpinner,
} from "./ui";
import type { Prompts } from "./ui";

/** Where a run's profile came from, in the order nipa looks. */
export type ProfileSource = "flag" | "env" | "link" | "config";

export interface ActiveProfile {
  readonly config: Config;
  readonly name: string;
  readonly profile: Profile;
  readonly source: ProfileSource;
  /** The folder's link, when it names this profile. Its project wins. */
  readonly link: FoundLink | undefined;
}

export interface SignedIn {
  readonly active: ActiveProfile;
  readonly session: Session;
}

export interface Cloud extends SignedIn {
  /** Nipa Cloud's Space API, as the session's project. */
  readonly space: Space;
}

/**
 * The profile a run uses: `--profile`, then NIPA_PROFILE, then the folder's
 * link, then the config's current profile. Throws, naming the known
 * profiles, when it doesn't exist.
 */
export const resolveProfile = async (input: {
  override: string | undefined;
  /** The folder's link, from `findLink()`. Left out, no folder links to a profile. */
  link?: FoundLink;
}): Promise<ActiveProfile> => {
  const { link: found } = input;
  const config = await loadConfig();
  const candidates: readonly [ProfileSource, string | undefined][] = [
    ["flag", input.override],
    ["env", process.env.NIPA_PROFILE],
    ["link", found?.link.profile],
  ];
  const [source, name] = candidates.find(
    (candidate): candidate is [ProfileSource, string] =>
      candidate[1] !== undefined
  ) ?? ["config", config.currentProfile];
  const profile = config.profiles[name];
  if (!profile) {
    const known = Object.keys(config.profiles).join(", ");
    const from =
      found?.link.profile === name ? ` in ${displayPath(found.file)}` : "";
    throw new CliError(`no profile named "${name}"${from}`, {
      hint: `Your profiles: ${known}. Add one with \`nipa profile add ${name}\`.`,
    });
  }
  const link = found?.link.profile === name ? found : undefined;
  return { config, link, name, profile, source };
};

/** `nipa login`, or `nipa login -P staging`, for hints. */
export const loginLine = (profile: string): string =>
  profile === DEFAULT_PROFILE ? "nipa login" : `nipa login -P ${profile}`;

/** Says which Keystone a command uses, unless it's the default one. */
export const announceProfile = (active: ActiveProfile): void => {
  if (active.name !== DEFAULT_PROFILE) {
    const host = dim(`(${new URL(active.profile.authUrl).host})`);
    log(`Using profile ${bold(active.name)} ${host}`);
  }
};

export interface LoginPrompts {
  email: (previous?: string) => Promise<string>;
  projectId: () => Promise<string>;
  password: () => Promise<string>;
  otp: (attempt: number) => Promise<string>;
}

const OTP_PATTERN = /^\d{6}$/u;
const PROJECT_ID_PATTERN = /^[\da-f]{32}$/u;
const OTP_ATTEMPTS = 3;

/** The login questions, asked on the terminal. */
export const loginPrompts = (prompts: Prompts): LoginPrompts => ({
  email: (previous) =>
    prompts.text({
      default: previous,
      message: "Email",
      validate: (value) =>
        value.includes("@") || "Enter the email you log in to the portal with",
    }),
  otp: (attempt) =>
    prompts.text({
      message: attempt === 1 ? "OTP code" : "Next OTP code",
      validate: (value) =>
        OTP_PATTERN.test(value) ||
        "Enter the 6-digit code from your authenticator app",
    }),
  password: () => prompts.secret("Password"),
  projectId: () =>
    prompts.text({
      message: "Project ID",
      validate: (value) =>
        PROJECT_ID_PATTERN.test(value) ||
        "Enter the 32-character ID, as in OS_PROJECT_ID in your openrc file",
    }),
});

const findProject = (input: {
  projects: readonly Project[];
  wanted: string;
}): Project => {
  const { projects, wanted } = input;
  const match = projects.find((p) => p.id === wanted || p.name === wanted);
  if (!match) {
    throw new CliError(`no project named or with ID "${wanted}"`, {
      hint: `Your projects: ${projects.map((p) => p.name).join(", ")}`,
    });
  }
  return match;
};

export const askProject =
  (input: { prompts: Prompts; current: Project; message: string }) =>
  (projects: readonly Project[]): Promise<Project> =>
    input.prompts.choice({
      choices: projects.map((p) => ({
        description: p.id,
        name:
          p.id === input.current.id ? `${p.name} ${bold("(current)")}` : p.name,
        value: p,
      })),
      default: projects.find((p) => p.id === input.current.id),
      message: input.message,
    });

export const pickProject = (input: {
  projects: readonly Project[];
  wanted?: string;
  ask: (projects: readonly Project[]) => Promise<Project>;
}): Promise<Project> => {
  const { projects, wanted } = input;
  if (wanted) {
    return Promise.resolve(findProject({ projects, wanted }));
  }
  const [first, ...rest] = projects;
  if (!first) {
    throw new CliError("your account has no projects you can use");
  }
  return rest.length === 0 ? Promise.resolve(first) : input.ask(projects);
};

export const toSession = (token: Token, project: Project): Session => ({
  expiresAt: token.expiresAt,
  project: token.project ?? project,
  token: token.value,
  user: token.user,
});

/** Asks for an OTP code, then for the next one after a wrong code, up to OTP_ATTEMPTS times. */
const verifyOtp = async (input: {
  account: Account;
  receipt: string;
  ask: LoginPrompts["otp"];
  attempt: number;
}): Promise<Token> => {
  const passcode = await input.ask(input.attempt);
  try {
    return await withSpinner("Checking the code…", () =>
      continueWithTotp({
        account: input.account,
        passcode,
        receipt: input.receipt,
      })
    );
  } catch (error) {
    const wrongCode = error instanceof KeystoneError && error.status === 401;
    if (!wrongCode || input.attempt === OTP_ATTEMPTS) {
      throw error;
    }
    log(
      "That code didn't work. Each code works once, so wait for the next one."
    );
    return verifyOtp({ ...input, attempt: input.attempt + 1 });
  }
};

const rememberedLogin = async (input: {
  keychain: Keychain | undefined;
  profile: Profile;
  username: string | undefined;
}): Promise<{ username: string; password: string } | undefined> => {
  const username = input.username ?? input.profile.username;
  if (!(username && input.keychain)) {
    return undefined;
  }
  const password = await input.keychain.read({
    authUrl: input.profile.authUrl,
    username,
  });
  return password === undefined ? undefined : { password, username };
};

type PasswordAnswer = Awaited<ReturnType<typeof loginWithPassword>>;

// Keystone refuses a saved password after it changes, so nipa deletes it.
const checkPassword = async (input: {
  account: Account;
  keychain: Keychain | undefined;
  prompts: LoginPrompts;
  remembered: string | undefined;
}): Promise<{ answer: PasswordAnswer; password: string }> => {
  const { account, keychain, prompts, remembered } = input;
  const check = async (password: string) => ({
    answer: await withSpinner("Checking your password…", () =>
      loginWithPassword(account, password)
    ),
    password,
  });
  if (remembered === undefined || !keychain) {
    return check(await prompts.password());
  }
  log(`Using the password saved in the ${keychain.name}`);
  try {
    return await check(remembered);
  } catch (error) {
    if (!(error instanceof KeystoneError && error.status === 401)) {
      throw error;
    }
    await keychain.remove(account);
    log("The saved password didn't work, so nipa deleted it.");
    return check(await prompts.password());
  }
};

export const authenticate = async (input: {
  profile: Profile;
  prompts: LoginPrompts;
  username?: string;
  wantedProject?: string;
  keychain?: Keychain;
  remember?: boolean;
}): Promise<Session> => {
  const { keychain, profile, prompts, wantedProject } = input;
  const remembered = await rememberedLogin({
    keychain,
    profile,
    username: input.username,
  });
  const username =
    remembered?.username ??
    input.username ??
    (await prompts.email(profile.username));

  // Nipa's gateway drops the connection for an unscoped token, which has no
  // catalog, so the login names a project before nipa can list them.
  const wantedId =
    wantedProject !== undefined && PROJECT_ID_PATTERN.test(wantedProject)
      ? wantedProject
      : undefined;
  const projectId =
    wantedId ?? profile.project?.id ?? (await prompts.projectId());
  const account: Account = {
    authUrl: profile.authUrl,
    projectId,
    userDomain: profile.userDomain,
    username,
  };
  const { answer, password } = await checkPassword({
    account,
    keychain,
    prompts,
    remembered: remembered?.password,
  });
  const token =
    answer.kind === "token"
      ? answer.token
      : await verifyOtp({
          account,
          ask: prompts.otp,
          attempt: 1,
          receipt: answer.receipt,
        });
  if (!token.project) {
    throw new KeystoneError(
      `Keystone returned a token without project ${projectId}`,
      0
    );
  }
  if (input.remember && keychain) {
    await keychain.save(account, password);
  }
  const wantedName = wantedId ? undefined : wantedProject;
  if (wantedName === undefined || token.project.name === wantedName) {
    return toSession(token, token.project);
  }

  // --project by name logs in to a project nipa knows, then switches.
  const projects = await withSpinner("Loading your projects…", () =>
    listProjects({ authUrl: profile.authUrl, token: token.value })
  );
  const project = findProject({ projects, wanted: wantedName });
  const scoped = await withSpinner(`Switching to ${project.name}…`, () =>
    rescope({
      authUrl: profile.authUrl,
      projectId: project.id,
      token: token.value,
    })
  );
  return toSession(scoped, project);
};

export const saveLogin = async (input: {
  active: ActiveProfile;
  session: Session;
}): Promise<void> => {
  const { active, session } = input;
  const profile = {
    ...active.profile,
    project: session.project,
    username: session.user.name,
  };
  await saveConfig({
    ...active.config,
    profiles: { ...active.config.profiles, [active.name]: profile },
  });
  await saveSession({ profile: active.name, session });
};

/**
 * Asks for the password and OTP code, saves the session and says who logged
 * in. Throws when there is no terminal.
 */
export const interactiveLogin = async (input: {
  active: ActiveProfile;
  prompts: Prompts;
  username?: string;
  wantedProject?: string;
  remember?: boolean;
}): Promise<Session> => {
  const { active, prompts } = input;
  if (!prompts.interactive) {
    throw new CliError(
      "`nipa login` needs a terminal to ask for your password",
      {
        hint: "Run it in a terminal, then run this command again.",
      }
    );
  }
  // Before any prompt, so a missing keychain fails before you type anything.
  const keychain = input.remember ? requireKeychain() : systemKeychain();
  const host = dim(`(${new URL(active.profile.authUrl).host})`);
  log(`Logging in to ${bold(active.name)} ${host}`);
  const session = await authenticate({
    keychain,
    profile: active.profile,
    prompts: loginPrompts(prompts),
    remember: input.remember,
    username: input.username,
    wantedProject: input.wantedProject,
  });
  await saveLogin({ active, session });
  const who = bold(session.user.name);
  success(`Logged in as ${who}, project ${bold(session.project.name)}`);
  if (input.remember && keychain) {
    log(
      `Saved your password in the ${keychain.name}, so the next login asks only for an OTP code.`
    );
  }
  return session;
};

/** Commands warn when the session expires sooner than this. */
export const EXPIRY_WARNING_MS = 30 * 60_000;

// A terraform apply that outlives the token fails halfway, so say so first.
const warnBeforeExpiry = (input: {
  profile: string;
  session: Session;
}): void => {
  const left = msUntilExpiry(input.session);
  if (left < EXPIRY_WARNING_MS) {
    note(
      `Your ${input.profile} session expires in ${formatDuration(left)}. Run \`${loginLine(input.profile)}\` to start a new one.`
    );
  }
};

const savedSession = async (input: {
  active: ActiveProfile;
  prompts: Prompts;
}): Promise<Session> => {
  const { active, prompts } = input;
  const session = await loadSession(active.name);
  if (isActive(session)) {
    warnBeforeExpiry({ profile: active.name, session });
    return session;
  }
  const hint = `Run \`${loginLine(active.name)}\`.`;
  if (!prompts.interactive) {
    throw session
      ? new CliError(`your ${active.name} session expired`, { hint })
      : new CliError(`you aren't logged in to ${active.name}`, { hint });
  }
  log(session ? "Your session expired." : "You aren't logged in yet.");
  return interactiveLogin({ active, prompts });
};

/**
 * A token for the linked project, for this run only, so the saved session
 * and other folders keep their project.
 */
const linkedSession = async (input: {
  active: ActiveProfile;
  link: FoundLink;
  session: Session;
}): Promise<Session> => {
  const { active, session } = input;
  const { file, link } = input.link;
  let token: Token;
  try {
    token = await withSpinner(`Switching to ${link.project.name}…`, () =>
      rescope({
        authUrl: active.profile.authUrl,
        projectId: link.project.id,
        token: session.token,
      })
    );
  } catch (error) {
    if (error instanceof KeystoneError && error.status === 401) {
      throw new CliError(
        `can't use project ${link.project.name}, which ${displayPath(file)} links to`,
        {
          hint: `Run \`nipa link\` to pick another project. If Keystone revoked your session, run \`${loginLine(active.name)}\`.`,
        }
      );
    }
    throw error;
  }
  log(
    `Using project ${bold(link.project.name)} from ${dim(displayPath(file))}`
  );
  return toSession(token, link.project);
};

/**
 * The profile's live session. Logs in first when it expired and nipa can
 * prompt, and throws "run nipa login" when it can't. In a linked folder, the
 * token is for the linked project, unless `linked` is false.
 */
export const requireSession = async (input: {
  active: ActiveProfile;
  prompts: Prompts;
  linked?: boolean;
}): Promise<SignedIn> => {
  const { active, prompts } = input;
  const session = await savedSession({ active, prompts });
  const link = input.linked === false ? undefined : active.link;
  if (!link || link.link.project.id === session.project.id) {
    return { active, session };
  }
  return {
    active,
    session: await linkedSession({ active, link, session }),
  };
};

/** A 401 means Keystone revoked the token before it expired. */
const guardSession =
  (profile: string) =>
  async <T>(task: () => Promise<T>): Promise<T> => {
    try {
      return await task();
    } catch (error) {
      const status =
        error instanceof ApiError || error instanceof KeystoneError
          ? error.status
          : undefined;
      if (status === 401) {
        throw new CliError(`your ${profile} session expired or was revoked`, {
          hint: `Run \`${loginLine(profile)}\`.`,
        });
      }
      throw error;
    }
  };

/** The error for a profile without a Space API URL, which `nipa os` and `nipa tf` don't need. */
export const noSpaceUrl = (active: ActiveProfile): CliError =>
  new CliError(`the ${active.name} profile has no Space API URL`, {
    hint: `Remove it with \`nipa profile rm ${active.name}\`, then add it again with \`--space-url\` and its Space portal URL. \`nipa -P ${active.name} os server list\` works without one.`,
  });

/**
 * The profile's Space API URL. Throws when it has none, before nipa asks for
 * a password it couldn't use.
 */
export const requireSpaceUrl = (active: ActiveProfile): string => {
  const { spaceUrl } = active.profile;
  if (!spaceUrl) {
    throw noSpaceUrl(active);
  }
  return spaceUrl;
};

/**
 * The Space API for a session. It takes the Keystone token, so nipa calls it
 * without asking for a password again.
 */
export const connect = (input: {
  signedIn: SignedIn;
  spaceUrl: string;
}): Cloud => {
  const { active, session } = input.signedIn;
  const guard = guardSession(active.name);
  const space = createSpace({
    projectId: session.project.id,
    region: active.profile.region,
    token: session.token,
    url: input.spaceUrl,
  });
  const call = <T>(task: () => Promise<T>): Promise<T> =>
    guard(async () => {
      try {
        return await task();
      } catch (error) {
        // The Keystone URL worked for the login, so it isn't the one to check.
        if (error instanceof NetworkError) {
          throw new CliError(error.message, {
            hint: "Check your network connection, or the profile's Space API URL.",
          });
        }
        throw error;
      }
    });
  return {
    active,
    session,
    space: {
      get: (path, schema) => call(() => space.get(path, schema)),
      getLines: (path, schema) => call(() => space.getLines(path, schema)),
      post: (path) => call(() => space.post(path)),
    },
  };
};

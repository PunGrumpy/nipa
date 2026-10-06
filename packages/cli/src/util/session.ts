// How nipa gets and keeps a session: which profile a run uses, logging in
// with a password and an OTP code, scoping to a project, and reaching
// Nipa Cloud's Space API with the token. Handlers reach it through the client
// (`client.profile()`, `client.session()`, `client.cloud()`). The login and
// switch commands also call interactiveLogin, pickProject and saveLogin.

import { ApiError, createSpace } from "./api";
import type { Space } from "./api";
import { NetworkError } from "./http";
import {
  continueWithTotp,
  KeystoneError,
  listProjects,
  loginWithPassword,
  rescope,
} from "./keystone";
import type { Account, Project, Token } from "./keystone";
import {
  DEFAULT_PROFILE,
  isActive,
  loadConfig,
  loadSession,
  saveConfig,
  saveSession,
} from "./store";
import type { Config, Profile, Session } from "./store";
import { bold, CliError, dim, log, success, withSpinner } from "./ui";
import type { Prompts } from "./ui";

export interface ActiveProfile {
  readonly config: Config;
  readonly name: string;
  readonly profile: Profile;
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
 * The profile a run uses: `--profile`, then NIPA_PROFILE, then the config's
 * current profile. Throws, naming the known profiles, when it doesn't exist.
 */
export const resolveProfile = async (input: {
  override: string | undefined;
}): Promise<ActiveProfile> => {
  const config = await loadConfig();
  const name =
    input.override ?? process.env.NIPA_PROFILE ?? config.currentProfile;
  const profile = config.profiles[name];
  if (!profile) {
    const known = Object.keys(config.profiles).join(", ");
    throw new CliError(`no profile named "${name}"`, {
      hint: `Your profiles: ${known}. Add one with \`nipa profile add ${name}\`.`,
    });
  }
  return { config, name, profile };
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

export const authenticate = async (input: {
  profile: Profile;
  prompts: LoginPrompts;
  username?: string;
  wantedProject?: string;
}): Promise<Session> => {
  const { profile, prompts, wantedProject } = input;
  const username = input.username ?? (await prompts.email(profile.username));

  // Nipa's gateway drops the connection for an unscoped token, which has no
  // catalog, so the login names a project before nipa can list them.
  const wantedId =
    wantedProject !== undefined && PROJECT_ID_PATTERN.test(wantedProject)
      ? wantedProject
      : undefined;
  const projectId =
    wantedId ?? profile.project?.id ?? (await prompts.projectId());
  const password = await prompts.password();
  const account: Account = {
    authUrl: profile.authUrl,
    projectId,
    userDomain: profile.userDomain,
    username,
  };

  const first = await withSpinner("Checking your password…", () =>
    loginWithPassword(account, password)
  );
  const token =
    first.kind === "token"
      ? first.token
      : await verifyOtp({
          account,
          ask: prompts.otp,
          attempt: 1,
          receipt: first.receipt,
        });
  if (!token.project) {
    throw new KeystoneError(
      `Keystone returned a token without project ${projectId}`,
      0
    );
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
  const host = dim(`(${new URL(active.profile.authUrl).host})`);
  log(`Logging in to ${bold(active.name)} ${host}`);
  const session = await authenticate({
    profile: active.profile,
    prompts: loginPrompts(prompts),
    username: input.username,
    wantedProject: input.wantedProject,
  });
  await saveLogin({ active, session });
  const who = bold(session.user.name);
  success(`Logged in as ${who}, project ${bold(session.project.name)}`);
  return session;
};

/**
 * The profile's live session. Logs in first when it expired and nipa can
 * prompt, and throws "run nipa login" when it can't.
 */
export const requireSession = async (input: {
  active: ActiveProfile;
  prompts: Prompts;
}): Promise<SignedIn> => {
  const { active, prompts } = input;
  const session = await loadSession(active.name);
  if (isActive(session)) {
    return { active, session };
  }
  const hint = `Run \`${loginLine(active.name)}\`.`;
  if (!prompts.interactive) {
    throw session
      ? new CliError(`your ${active.name} session expired`, { hint })
      : new CliError(`you aren't logged in to ${active.name}`, { hint });
  }
  log(session ? "Your session expired." : "You aren't logged in yet.");
  return { active, session: await interactiveLogin({ active, prompts }) };
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

/**
 * The profile's Space API URL. Throws when it has none, before nipa asks for
 * a password it couldn't use.
 */
export const requireSpaceUrl = (active: ActiveProfile): string => {
  const { spaceUrl } = active.profile;
  if (!spaceUrl) {
    throw new CliError(`the ${active.name} profile has no Space API URL`, {
      hint: `Remove it with \`nipa profile rm ${active.name}\`, then add it again with \`--space-url\` and its Space portal URL. \`nipa -P ${active.name} os server list\` works without one.`,
    });
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
      post: (path) => call(() => space.post(path)),
    },
  };
};

import { parseArgs } from "node:util";

import { password, select, spinner, text } from "@clack/prompts";

import {
  KeystoneError,
  listProjects,
  loginWithPasswordTotp,
  rescope,
} from "../lib/keystone";
import type { Project, Token } from "../lib/keystone";
import { loadConfig, saveConfig, saveSession } from "../lib/store";
import type { Config, Session } from "../lib/store";
import {
  answered,
  bold,
  CliError,
  dim,
  formatDuration,
  info,
  promptOptions,
  success,
} from "../lib/ui";

const OTP_PATTERN = /^\d{6}$/u;
const PROJECT_ID_PATTERN = /^[\da-f]{32}$/u;

export const loginUsage = `Usage: nipa login [options]

Log in to Nipa Cloud with your password and an OTP code. nipa saves the token
in ~/.config/nipa/auth.json and reuses it until it expires.

Options:
  -u, --username <email>   log in as this user (default: the last one)
  -p, --project <name|id>  scope to this project (default: the last one, or ask)
`;

export const pickProject = async (
  projects: Project[],
  wanted?: string
): Promise<Project> => {
  if (wanted) {
    const match = projects.find((p) => p.id === wanted || p.name === wanted);
    if (!match) {
      throw new CliError(`no project named or with ID "${wanted}"`, {
        hint: `Your projects: ${projects.map((p) => p.name).join(", ")}`,
      });
    }
    return match;
  }
  const [only] = projects;
  if (projects.length === 1 && only) {
    return only;
  }
  if (projects.length === 0) {
    throw new CliError("your account has no projects you can use");
  }
  return answered(
    await select({
      ...promptOptions,
      message: "Which project?",
      options: projects.map((p) => ({
        hint: p.id.slice(0, 8),
        label: p.name,
        value: p,
      })),
    })
  );
};

export const toSession = (token: Token, project: Project): Session => ({
  expiresAt: token.expiresAt,
  project: token.project ?? project,
  token: token.value,
  user: token.user,
});

const authenticate = async (
  config: Config,
  credentials: { username: string; password: string; passcode: string },
  wantedProject?: string
): Promise<Session> => {
  const { username, password: pass, passcode } = credentials;
  const base = {
    passcode,
    password: pass,
    userDomain: config.userDomain,
    username,
  };

  // Known project: one request. Otherwise log in unscoped, list, then rescope.
  // The OTP code is single-use, so never retry the password step.
  const known = wantedProject ?? config.project?.id;
  if (known && PROJECT_ID_PATTERN.test(known)) {
    const token = await loginWithPasswordTotp(config.authUrl, {
      ...base,
      projectId: known,
    });
    if (!token.project) {
      throw new CliError("Keystone returned an unscoped token");
    }
    return toSession(token, token.project);
  }

  const unscoped = await loginWithPasswordTotp(config.authUrl, base);
  const projects = await listProjects(config.authUrl, unscoped.value);
  const project = await pickProject(projects, known);
  const scoped = await rescope(config.authUrl, unscoped.value, project.id);
  return toSession(scoped, project);
};

export const login = async (args: string[] = []): Promise<Session> => {
  const { values } = parseArgs({
    args,
    options: {
      project: { short: "p", type: "string" },
      username: { short: "u", type: "string" },
    },
  });
  if (!process.stdin.isTTY) {
    throw new CliError(
      "nipa login needs a terminal to ask for your password and OTP code"
    );
  }

  const config = await loadConfig();
  const host = dim(`(${new URL(config.authUrl).host})`);
  info(`Log in to Nipa Cloud ${host}`);

  const username =
    values.username ??
    config.username ??
    answered(
      await text({
        ...promptOptions,
        message: "Email",
        validate: (v) =>
          v?.includes("@") ? undefined : "Enter the email you use for Space",
      })
    );
  if (values.username === undefined && config.username) {
    info(`Username ${bold(username)}`);
  }
  const pass = answered(
    await password({ ...promptOptions, message: "Password" })
  );
  const passcode = answered(
    await text({
      ...promptOptions,
      message: "OTP code",
      validate: (v) =>
        OTP_PATTERN.test(v ?? "") ? undefined : "Enter the 6-digit code",
    })
  );

  const spin = spinner({ ...promptOptions, indicator: "timer" });
  spin.start("Verifying");
  let session: Session;
  try {
    session = await authenticate(
      config,
      { passcode, password: pass, username },
      values.project
    );
    spin.clear();
  } catch (error) {
    spin.clear();
    if (error instanceof KeystoneError) {
      throw new CliError(error.message, {
        hint:
          error.status === 401
            ? "OTP codes work once; wait for the next code."
            : undefined,
      });
    }
    throw error;
  }

  await saveConfig({ ...config, project: session.project, username });
  await saveSession(session);
  const expiresIn = formatDuration(Date.parse(session.expiresAt) - Date.now());
  const detail = dim(`(${session.project.name}, expires in ${expiresIn})`);
  success(`Logged in as ${bold(session.user.name)} ${detail}`);
  return session;
};

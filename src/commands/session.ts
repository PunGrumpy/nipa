import { parseArgs } from "node:util";

import { spinner } from "@clack/prompts";

import {
  detectShell,
  formatEnv,
  isShell,
  sessionEnv,
  SHELLS,
} from "../lib/env";
import { listProjects, rescope, revoke } from "../lib/keystone";
import {
  clearSession,
  isActive,
  loadConfig,
  loadSession,
  msUntilExpiry,
  saveConfig,
  saveSession,
} from "../lib/store";
import type { Session } from "../lib/store";
import {
  bold,
  CliError,
  dim,
  formatDuration,
  note,
  promptOptions,
  success,
} from "../lib/ui";
import { login, pickProject, toSession } from "./login";

const notLoggedIn = () =>
  new CliError("you are not logged in", { hint: "Run `nipa login` first." });

/** The current session; logs in first when there is none and a terminal can ask. */
export const requireSession = async (): Promise<Session> => {
  const session = await loadSession();
  if (isActive(session)) {
    return session;
  }
  if (!process.stdin.isTTY) {
    throw session
      ? new CliError("your session expired", { hint: "Run `nipa login`." })
      : notLoggedIn();
  }
  return login();
};

export const whoamiUsage = `Usage: nipa whoami [--json]

Show the user, project and how long the session has left.
`;

export const whoami = async (args: string[]): Promise<number> => {
  const { values } = parseArgs({
    args,
    options: { json: { type: "boolean" } },
  });
  const [config, session] = await Promise.all([loadConfig(), loadSession()]);
  if (!isActive(session)) {
    throw notLoggedIn();
  }
  if (values.json) {
    const out = {
      authUrl: config.authUrl,
      expiresAt: session.expiresAt,
      project: session.project,
      region: config.region,
      user: session.user,
    };
    console.log(JSON.stringify(out, null, 2));
    return 0;
  }
  const projectId = dim(`(${session.project.id})`);
  console.log(session.user.name);
  console.error(`  ${dim("project")}  ${session.project.name} ${projectId}`);
  console.error(`  ${dim("region")}   ${config.region}`);
  console.error(
    `  ${dim("expires")}  in ${formatDuration(msUntilExpiry(session))}`
  );
  return 0;
};

export const switchUsage = `Usage: nipa switch [project]

Scope the session to another project, by name or ID. Without an argument,
pick from a list. No password or OTP code is needed.
`;

export const switchProject = async (args: string[]): Promise<number> => {
  const { positionals } = parseArgs({
    allowPositionals: true,
    args,
    options: {},
  });
  const config = await loadConfig();
  const session = await requireSession();
  const projects = await listProjects({
    authUrl: config.authUrl,
    token: session.token,
  });
  const project = await pickProject(projects, positionals[0]);
  if (project.id === session.project.id) {
    success(`Already using ${bold(project.name)}`);
    return 0;
  }
  const spin = spinner(promptOptions);
  spin.start(`Switching to ${project.name}`);
  let next: Session;
  try {
    next = toSession(
      await rescope({
        authUrl: config.authUrl,
        projectId: project.id,
        token: session.token,
      }),
      project
    );
  } finally {
    spin.clear();
  }
  await saveSession(next);
  await saveConfig({ ...config, project: next.project });
  success(`Switched to ${bold(next.project.name)}`);
  return 0;
};

export const logoutUsage = `Usage: nipa logout

Revoke the token and delete the saved session. Your username and last project
are kept for the next login.
`;

export const logout = async (): Promise<number> => {
  const [config, session] = await Promise.all([loadConfig(), loadSession()]);
  if (!session) {
    note("Not currently logged in, so `nipa logout` did nothing");
    return 0;
  }
  if (isActive(session)) {
    try {
      await revoke({ authUrl: config.authUrl, token: session.token });
    } catch {
      // Best effort: the local session is deleted either way, and the token expires on its own.
    }
  }
  await clearSession();
  success("Logged out!");
  return 0;
};

export const envUsage = `Usage: nipa env [--shell bash|zsh|fish]

Print the OS_* variables for the session, to load them into your shell:

  eval "$(nipa env)"     # bash, zsh
  nipa env | source      # fish
`;

export const env = async (args: string[]): Promise<number> => {
  const { values } = parseArgs({
    args,
    options: { shell: { type: "string" } },
  });
  const shell = values.shell ?? detectShell(process.env.SHELL);
  if (!isShell(shell)) {
    throw new CliError(`unknown shell "${shell}"`, {
      exitCode: 2,
      hint: `Use one of: ${SHELLS.join(", ")}.`,
    });
  }
  const [config, session] = await Promise.all([loadConfig(), requireSession()]);
  console.log(formatEnv(sessionEnv(config, session), shell));
  return 0;
};

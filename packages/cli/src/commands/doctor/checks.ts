import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { ApiError, createSpace, probeSpace } from "../../util/api";
import { capitalize, fail, pass, warn } from "../../util/doctor";
import type { Check, CheckResult } from "../../util/doctor";
import { findCommand } from "../../util/env";
import { listFlavors } from "../../util/flavor";
import { NetworkError } from "../../util/http";
import { KeystoneError, listProjects, probe } from "../../util/keystone";
import { displayPath, findLink } from "../../util/link";
import { EXPIRY_WARNING_MS, loginLine, noSpaceUrl } from "../../util/session";
import type { ActiveProfile, ProfileSource } from "../../util/session";
import {
  configFiles,
  DEFAULT_PROFILE,
  isActive,
  loadConfig,
  loadSession,
  msUntilExpiry,
  StoreError,
} from "../../util/store";
import type { Session } from "../../util/store";
import { INSTALL_HINTS } from "../../util/tool";
import { formatDuration, formatElapsed } from "../../util/ui";
import { knownUpdate, releaseNotes } from "../../util/update";

export interface DoctorContext {
  readonly profile: () => Promise<ActiveProfile>;
  readonly session: () => Promise<Session | undefined>;
  readonly version: string;
}

type CheckId =
  | "config"
  | "profile"
  | "keystone"
  | "space"
  | "session"
  | "token"
  | "link"
  | "tools"
  | "update";

const tilde = (file: string): string => {
  const home = homedir();
  return file.startsWith(`${home}${path.sep}`)
    ? `~${file.slice(home.length)}`
    : file;
};

const timed = async <T>(
  task: () => Promise<T>
): Promise<{ value: T; elapsed: string }> => {
  const started = performance.now();
  const value = await task();
  return { elapsed: formatElapsed(performance.now() - started), value };
};

const hostOf = (url: string): string => new URL(url).host;

const checkConfig = async (): Promise<CheckResult> => {
  try {
    await Promise.all([loadConfig(), loadSession(DEFAULT_PROFILE)]);
  } catch (error) {
    if (error instanceof StoreError) {
      return fail(
        capitalize(error.message),
        "Fix the file, or delete it and run `nipa login` again."
      );
    }
    throw error;
  }
  const files = configFiles();
  const dir = tilde(path.dirname(files[0] ?? ""));
  const found = files.filter((file) => existsSync(file));
  if (found.length === 0) {
    return pass(`No files in ${dir} yet, so nipa uses prod`);
  }
  const names = found.map((file) => path.basename(file)).join(" and ");
  return pass(`${names} in ${dir} ${found.length === 1 ? "is" : "are"} valid`);
};

const SOURCES: Record<ProfileSource, (active: ActiveProfile) => string> = {
  config: () => "the current profile",
  env: () => "from NIPA_PROFILE",
  flag: () => "from --profile",
  link: (active) =>
    `from ${active.link ? displayPath(active.link.file) : "the folder's link"}`,
};

const checkProfile = async (context: DoctorContext): Promise<CheckResult> => {
  const active = await context.profile();
  const host = hostOf(active.profile.authUrl);
  return pass(`${active.name} (${host}), ${SOURCES[active.source](active)}`);
};

const checkKeystone = async (context: DoctorContext): Promise<CheckResult> => {
  const { profile } = await context.profile();
  try {
    const { elapsed, value } = await timed(() => probe(profile.authUrl));
    return pass(
      `${hostOf(profile.authUrl)} answers as Keystone ${value} [${elapsed}]`
    );
  } catch (error) {
    if (error instanceof NetworkError || error instanceof KeystoneError) {
      return fail(
        capitalize(error.message),
        "Check the Keystone URL with `nipa profile ls`, or your network connection."
      );
    }
    throw error;
  }
};

// A profile without a Space API URL still runs `nipa os` and `nipa tf`.
const checkSpace = async (context: DoctorContext): Promise<CheckResult> => {
  const active = await context.profile();
  const url = active.profile.spaceUrl;
  if (!url) {
    const { hint, message } = noSpaceUrl(active);
    return warn(capitalize(message), hint);
  }
  try {
    const { elapsed } = await timed(() => probeSpace(url));
    return pass(`${hostOf(url)} answers as the Space API [${elapsed}]`);
  } catch (error) {
    if (error instanceof NetworkError) {
      return fail(
        capitalize(error.message),
        "Check your network connection, or the profile's Space API URL."
      );
    }
    if (error instanceof ApiError) {
      return fail(
        capitalize(error.message),
        "Check the profile's `spaceUrl` with `nipa profile ls --json`. It's the portal URL with /api, such as https://space.nipa.cloud/api."
      );
    }
    throw error;
  }
};

const checkSession = async (context: DoctorContext): Promise<CheckResult> => {
  const { name } = await context.profile();
  const session = await context.session();
  const hint = `Run \`${loginLine(name)}\`.`;
  if (!session) {
    return fail(`You aren't logged in to ${name}`, hint);
  }
  if (!isActive(session)) {
    return fail(`Your ${name} session expired`, hint);
  }
  const left = msUntilExpiry(session);
  const summary = `Logged in as ${session.user.name} to ${session.project.name}, expires in ${formatDuration(left)}`;
  return left < EXPIRY_WARNING_MS
    ? warn(summary, `Run \`${loginLine(name)}\` to start a new one.`)
    : pass(summary);
};

// GET /v3/auth/projects is the read that `nipa switch` makes with a saved
// token: one request, through Nipa's gateway, that changes nothing.
const checkToken = async (
  context: DoctorContext,
  earlier: ReadonlyMap<CheckId, CheckResult>
): Promise<CheckResult> => {
  const active = await context.profile();
  const session = await context.session();
  if (!session) {
    return fail(`You aren't logged in to ${active.name}`);
  }
  const relogin = `Run \`${loginLine(active.name)}\`.`;
  const { spaceUrl } = active.profile;
  const withSpace = spaceUrl && earlier.get("space")?.status === "pass";
  try {
    const { elapsed } = await timed(async () => {
      await listProjects({
        authUrl: active.profile.authUrl,
        token: session.token,
      });
      if (withSpace) {
        await listFlavors(
          createSpace({
            projectId: session.project.id,
            region: active.profile.region,
            token: session.token,
            url: spaceUrl,
          })
        );
      }
    });
    return pass(
      `${withSpace ? "Keystone and the Space API accept" : "Keystone accepts"} the token [${elapsed}]`
    );
  } catch (error) {
    if (error instanceof KeystoneError && error.status === 401) {
      return fail("Keystone refuses the token, so it was revoked", relogin);
    }
    if (error instanceof ApiError && error.status === 401) {
      return fail(
        "The Space API refuses the token that Keystone accepts",
        "The Space API may belong to another Keystone. Check the profile's `authUrl` and `spaceUrl` with `nipa profile ls --json`."
      );
    }
    throw error;
  }
};

// The token check proved the session, so listing its projects says whether
// the switch that commands here make would work, without making it.
const checkLink = async (
  context: DoctorContext,
  earlier: ReadonlyMap<CheckId, CheckResult>
): Promise<CheckResult> => {
  const found = await findLink();
  if (!found) {
    return pass("This folder isn't linked");
  }
  const active = await context.profile();
  const file = displayPath(found.file);
  const { profile, project } = found.link;
  if (profile !== active.name) {
    return pass(`${file} links ${profile}, which this run doesn't use`);
  }
  const session = await context.session();
  if (!session || earlier.get("token")?.status !== "pass") {
    return pass(`${file} links ${project.name}`);
  }
  if (project.id === session.project.id) {
    return pass(`${file} links ${project.name}, the session's project`);
  }
  const projects = await listProjects({
    authUrl: active.profile.authUrl,
    token: session.token,
  });
  return projects.some((p) => p.id === project.id)
    ? pass(
        `${file} links ${project.name}, so commands here switch to it for each run`
      )
    : fail(
        `${file} links ${project.name}, which your account can't use`,
        "Run `nipa link` to pick another project."
      );
};

const TOOLS = [
  { command: "openstack", runner: "nipa os" },
  { command: "terraform", runner: "nipa tf" },
] as const;

const and = (words: readonly string[]): string => words.join(" and ");

const checkTools = (): Promise<CheckResult> => {
  const missing = TOOLS.filter(({ command }) => !findCommand(command));
  if (missing.length === 0) {
    return Promise.resolve(
      pass(`Found ${and(TOOLS.map(({ command }) => command))}`)
    );
  }
  const commands = and(missing.map(({ command }) => command));
  const runners = and(missing.map(({ runner }) => `\`${runner}\``));
  const hint = missing
    .map(({ command }) => INSTALL_HINTS.get(command))
    .join(" ");
  return Promise.resolve(
    warn(`Can't find ${commands}, so ${runners} won't run`, hint)
  );
};

const checkUpdate = async (context: DoctorContext): Promise<CheckResult> => {
  const latest = await knownUpdate(context.version);
  if (!latest) {
    return pass(`You have nipa ${context.version}`);
  }
  return warn(
    `nipa ${latest} is out, and you have ${context.version}`,
    `Run \`npm install -g nipa-cli\`, or download it from ${releaseNotes(latest)}.`
  );
};

export const CHECKS: readonly Check<CheckId, DoctorContext>[] = [
  { id: "config", run: checkConfig, title: "Config files" },
  { id: "profile", needs: ["config"], run: checkProfile, title: "Profile" },
  { id: "keystone", needs: ["profile"], run: checkKeystone, title: "Keystone" },
  { id: "space", needs: ["profile"], run: checkSpace, title: "Space API" },
  { id: "session", needs: ["profile"], run: checkSession, title: "Session" },
  {
    id: "token",
    needs: ["keystone", "session"],
    run: checkToken,
    title: "Token",
  },
  { id: "link", needs: ["profile"], run: checkLink, title: "Linked folder" },
  { id: "tools", run: checkTools, title: "Tools" },
  { id: "update", run: checkUpdate, title: "Update" },
];

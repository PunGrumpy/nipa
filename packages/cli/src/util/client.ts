// What a handler gets besides its parsed input: the result stream, the
// prompts, and the profile, session and cloud this run uses. One client per
// run, made by the dispatcher after it has read every global option.

import type { GlobalValues } from "./arg-common";
import { setProfileOption } from "./errors";
import { findLink, LinkError } from "./link";
import {
  announceProfile,
  connect,
  requireSession,
  requireSpaceUrl,
  resolveProfile,
} from "./session";
import type { ActiveProfile, Cloud, SignedIn } from "./session";
import type { ProgramSpec } from "./spec";
import { createPrompts, createResultStream, setAnimation } from "./ui";
import type { Prompts, ResultStream } from "./ui";

export interface Client {
  /** Results: JSON, IDs, scripts. Messages go through util/ui.ts's log and friends. */
  readonly stdout: ResultStream;
  readonly prompts: Prompts;
  /** The run's `--project`, a name or ID. `login` saves it. Every other command uses it for this run only. */
  readonly project: string | undefined;
  /** Every command's spec, for commands that describe nipa itself, such as `completion`. */
  readonly program: ProgramSpec;
  /** The profile this run uses: `--profile`, then NIPA_PROFILE, then the folder's link, then the current one. */
  readonly profile: () => Promise<ActiveProfile>;
  /**
   * profile(), or the profile without the folder's link when nipa can't read
   * the link file, for a command that reports that file itself.
   */
  readonly profileWithoutBrokenLink: () => Promise<ActiveProfile>;
  /**
   * profile() with a live session. Logs in first when it expired and nipa
   * can prompt. The session is for the `--project`, else the linked folder's
   * project, else the saved one.
   */
  readonly session: () => Promise<SignedIn>;
  /** session() with the saved project, whatever the folder links to or `--project` says. */
  readonly savedSession: () => Promise<SignedIn>;
  /**
   * session(), announcing a non-prod profile first, for commands that run a
   * program with the session and need no Space API: os, tf and exec.
   */
  readonly toolSession: () => Promise<SignedIn>;
  /** session() with the Space API. Says which profile it uses when that isn't prod. */
  readonly cloud: () => Promise<Cloud>;
}

/** Runs task on the first call. Later calls share its promise, so a second call never logs in twice. */
const once = <T>(task: () => Promise<T>): (() => Promise<T>) => {
  let result: Promise<T> | undefined;
  return () => {
    result ??= task();
    return result;
  };
};

export const createClient = (input: {
  globals: GlobalValues;
  /** The command line asks for `--json`. False for a passthrough command. */
  json: boolean;
  program: ProgramSpec;
}): Client => {
  const { globals, json, program } = input;
  setProfileOption(globals.profile);
  // util/http.ts reads NIPA_DEBUG on each request.
  if (globals.debug) {
    process.env.NIPA_DEBUG = "1";
  }
  const prompts = createPrompts({
    env: process.env,
    json,
    nonInteractive: globals["non-interactive"] === true,
    stderr: process.stderr,
    stdin: process.stdin,
  });
  setAnimation(prompts.interactive && process.env.TERM !== "dumb");
  const link = once(() => findLink());
  const profile = once(async () =>
    resolveProfile({ link: await link(), override: globals.profile })
  );
  const profileWithoutBrokenLink = once(async () => {
    try {
      return await profile();
    } catch (error) {
      if (!(error instanceof LinkError)) {
        throw error;
      }
      return resolveProfile({ override: globals.profile });
    }
  });
  const session = once(async () =>
    requireSession({
      active: await profile(),
      project: globals.project,
      prompts,
    })
  );
  const savedSession = once(async () =>
    requireSession({ active: await profile(), prompts, saved: true })
  );
  const toolSession = once(async () => {
    const active = await profile();
    // Before the session, so a login prompt reads under the profile line.
    announceProfile(active);
    return session();
  });
  const cloud = once(async () => {
    const active = await profile();
    const spaceUrl = requireSpaceUrl(active);
    // Before the session, so a linked project or a login reads under it.
    announceProfile(active);
    return connect({ signedIn: await session(), spaceUrl });
  });
  return {
    cloud,
    profile,
    profileWithoutBrokenLink,
    program,
    project: globals.project,
    prompts,
    savedSession,
    session,
    stdout: createResultStream(process.stdout),
    toolSession,
  };
};

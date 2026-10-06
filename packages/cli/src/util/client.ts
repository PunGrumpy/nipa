// What a handler gets besides its parsed input: the result stream, the
// prompts, and the profile, session and cloud this run uses. One client per
// run, made by the dispatcher after it has read every global option.

import type { GlobalValues } from "./arg-common";
import {
  announceProfile,
  connect,
  requireSession,
  requireSpaceUrl,
  resolveProfile,
} from "./session";
import type { ActiveProfile, Cloud, SignedIn } from "./session";
import type { ProgramSpec } from "./spec";
import { createPrompts, createResultStream } from "./ui";
import type { Prompts, ResultStream } from "./ui";

export interface Client {
  /** Results: JSON, IDs, scripts. Messages go through util/ui.ts's log and friends. */
  readonly stdout: ResultStream;
  readonly prompts: Prompts;
  /** Every command's spec, for commands that describe nipa itself, such as `completion`. */
  readonly program: ProgramSpec;
  /** The profile this run uses: `--profile`, then NIPA_PROFILE, then the current one. */
  readonly profile: () => Promise<ActiveProfile>;
  /**
   * profile() with a live session. Logs in first when it expired and nipa
   * can prompt. In a linked folder, the session is for the linked project.
   */
  readonly session: () => Promise<SignedIn>;
  /** session() with the saved project, whatever the folder links to. */
  readonly savedSession: () => Promise<SignedIn>;
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
  program: ProgramSpec;
}): Client => {
  const { globals, program } = input;
  // util/http.ts reads NIPA_DEBUG on each request.
  if (globals.debug) {
    process.env.NIPA_DEBUG = "1";
  }
  const prompts = createPrompts({
    stderr: process.stderr,
    stdin: process.stdin,
  });
  const profile = once(() => resolveProfile({ override: globals.profile }));
  const session = once(async () =>
    requireSession({ active: await profile(), prompts })
  );
  const savedSession = once(async () =>
    requireSession({ active: await profile(), linked: false, prompts })
  );
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
    program,
    prompts,
    savedSession,
    session,
    stdout: createResultStream(process.stdout),
  };
};

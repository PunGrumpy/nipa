// What a handler gets besides its parsed input: the result stream, the
// prompts, and the profile, session and cloud this run uses. One client per
// run, made by the dispatcher after it has read every global option.

import type { GlobalValues } from "./arg-common";
import {
  announceProfile,
  connect,
  requireSession,
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
  /** profile() with a live session. Logs in first when it expired and nipa can prompt. */
  readonly session: () => Promise<SignedIn>;
  /** session() with OpenStack services. Says which profile it uses when that isn't prod. */
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
  const cloud = once(async () => {
    const signedIn = await session();
    announceProfile(signedIn.active);
    return connect(signedIn);
  });
  return {
    cloud,
    profile,
    program,
    prompts,
    session,
    stdout: createResultStream(process.stdout),
  };
};

// Searches the servers of every project the account can use, live: nothing is
// stored, so the result is as fresh as the portal. Each project costs one
// Keystone exchange and one server list, a few projects at a time, and a
// project that fails or stalls is a result of its own, not the end of the run.

import { ApiError } from "./api";
import { listServers } from "./compute";
import type { Server } from "./compute";
import { toCliError } from "./errors";
import { fanOut } from "./fan-out";
import type { Settled } from "./fan-out";
import { KeystoneError, rescope } from "./keystone";
import type { Project } from "./keystone";
import { connect, toSession } from "./session";
import type { ActiveProfile } from "./session";
import type { Session } from "./store";
import { CliError, formatElapsed } from "./ui";

/** How many projects are searched at once. */
export const SEARCH_CONCURRENCY = 4;

/** How long one project may take, from the moment its search starts. */
export const PROJECT_DEADLINE_MS = 15_000;

/**
 * Whether the server matches `query`: a case-insensitive piece of its name,
 * its ID or any of its addresses. The query is literal text, not a pattern.
 * No query matches every server.
 */
export const matchesServer = (server: Server, query?: string): boolean => {
  if (query === undefined || query === "") {
    return true;
  }
  const wanted = query.toLowerCase();
  return [server.name, server.id, ...server.addresses.map((a) => a.address)]
    .map((text) => text.toLowerCase())
    .some((text) => text.includes(wanted));
};

/** Why one project couldn't be searched. */
export interface Failure {
  /** What went wrong, as a person reads it. */
  readonly message: string;
  /** The HTTP status that said so, or null for a stall or a dropped connection. */
  readonly status: number | null;
  /** The error nipa would print for this failure alone. */
  readonly cause: CliError;
}

/** What one project gave: its matching servers, or why it gave none. */
export type Outcome =
  | {
      readonly project: Project;
      /** The servers that match, in the order the API listed them. */
      readonly servers: readonly Server[];
      /**
       * The names that more than one server in the project has, matching or
       * not, because a name can't pick one of them for a command.
       */
      readonly repeated: ReadonlySet<string>;
    }
  | { readonly project: Project; readonly failure: Failure };

export type Searched = Extract<Outcome, { servers: readonly Server[] }>;
export type Failed = Extract<Outcome, { failure: Failure }>;

export const isFailed = (outcome: Outcome): outcome is Failed =>
  "failure" in outcome;

export const isSearched = (outcome: Outcome): outcome is Searched =>
  !isFailed(outcome);

/** The names that two or more servers share. */
export const repeatedNames = (servers: readonly Server[]): Set<string> => {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const { name } of servers) {
    (seen.has(name) ? repeated : seen).add(name);
  }
  return repeated;
};

/**
 * Projects by name, then by ID, whatever order the searches finished in. The
 * servers of a project keep the order the API listed them in.
 */
export const orderOutcomes = (outcomes: readonly Outcome[]): Outcome[] =>
  outcomes.toSorted(
    (a, b) =>
      a.project.name.localeCompare(b.project.name) ||
      a.project.id.localeCompare(b.project.id)
  );

const failure = (cause: CliError, status: number | null): Failure => ({
  cause,
  message: cause.message,
  status,
});

/**
 * The failure for an error from one project. An error nipa doesn't expect is
 * a bug, so it is thrown again instead of being listed as a project's fault.
 */
export const describeFailure = (error: Error): Failure => {
  // Searching is the only Keystone call that can refuse one project: the
  // token is good, because the project list just answered with it.
  if (error instanceof KeystoneError && error.status === 401) {
    return failure(
      new CliError("Keystone refused the project", { reason: "api_error" }),
      401
    );
  }
  const cause = toCliError(error);
  if (!cause) {
    throw error;
  }
  if (error instanceof ApiError || error instanceof KeystoneError) {
    return failure(cause, error.status);
  }
  return failure(cause, cause.reason === "token_expired" ? 401 : null);
};

const settledOutcome = (
  project: Project,
  settled: Settled<Searched>,
  deadlineMs: number
): Outcome => {
  switch (settled.kind) {
    case "done": {
      return settled.value;
    }
    case "timeout": {
      const cause = new CliError(
        `didn't answer in ${formatElapsed(deadlineMs)}`,
        { reason: "timeout" }
      );
      return { failure: failure(cause, null), project };
    }
    case "failed": {
      if (!(settled.error instanceof Error)) {
        throw settled.error;
      }
      return { failure: describeFailure(settled.error), project };
    }
    default: {
      const _exhaustive: never = settled;
      return _exhaustive;
    }
  }
};

export interface SearchInput {
  readonly active: ActiveProfile;
  /** The saved session. Its token is exchanged for one per project. */
  readonly session: Session;
  readonly spaceUrl: string;
  readonly projects: readonly Project[];
  readonly query?: string;
  readonly limit?: number;
  readonly deadlineMs?: number;
}

/** The outcome of a project whose servers are listed, with the ones that match `query`. */
export const searchedProject = (
  project: Project,
  servers: readonly Server[],
  query?: string
): Searched => ({
  project,
  repeated: repeatedNames(servers),
  servers: servers.filter((server) => matchesServer(server, query)),
});

const searchOne = async (
  input: SearchInput,
  project: Project,
  signal: AbortSignal
): Promise<Searched> => {
  const { active, query, session, spaceUrl } = input;
  // The saved project needs no exchange: the token is already its own.
  const scoped =
    project.id === session.project.id
      ? session
      : toSession(
          await rescope({
            authUrl: active.profile.authUrl,
            projectId: project.id,
            signal,
            token: session.token,
          }),
          project
        );
  const { space } = connect({
    signal,
    signedIn: { active, session: scoped },
    spaceUrl,
  });
  return searchedProject(project, await listServers(space), query);
};

/**
 * Searches every project and returns one outcome for each, ordered by
 * project. A failure of one project never stops the others.
 */
export const searchProjects = async (
  input: SearchInput
): Promise<Outcome[]> => {
  const deadlineMs = input.deadlineMs ?? PROJECT_DEADLINE_MS;
  const settled = await fanOut(
    input.projects,
    (project, signal) => searchOne(input, project, signal),
    { deadlineMs, limit: input.limit ?? SEARCH_CONCURRENCY }
  );
  return orderOutcomes(
    settled.flatMap((result, at) => {
      const project = input.projects[at];
      return project ? [settledOutcome(project, result, deadlineMs)] : [];
    })
  );
};

// A session that expired and a network that is down fail every project the
// same way, so the one error says it better than a list of identical lines.
const SHARED_REASONS = new Set(["token_expired", "network_error"]);

/**
 * The one error that every project failed with, when it is one that no
 * project could have avoided. Undefined when any project was searched or the
 * failures differ.
 */
export const sharedFailure = (
  outcomes: readonly Outcome[]
): CliError | undefined => {
  const failures = outcomes.filter(isFailed);
  const [first] = failures;
  if (!first || failures.length !== outcomes.length) {
    return undefined;
  }
  const { message, reason } = first.failure.cause;
  const same = failures.every(
    ({ failure: { cause } }) =>
      cause.reason === reason && cause.message === message
  );
  return same && SHARED_REASONS.has(reason) ? first.failure.cause : undefined;
};

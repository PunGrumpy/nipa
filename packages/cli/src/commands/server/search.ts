import { handle } from "../../util/command";
import type { Client } from "../../util/command";
import { listServers } from "../../util/compute";
import type { Project } from "../../util/keystone";
import { runScope } from "../../util/scope";
import {
  isFailed,
  searchedProject,
  searchProjects,
  sharedFailure,
} from "../../util/server-search";
import type { Outcome } from "../../util/server-search";
import {
  announceProfile,
  listedProjects,
  requireSpaceUrl,
} from "../../util/session";
import {
  CliError,
  formatElapsed,
  isJsonMode,
  log,
  oneLine,
  plural,
  printError,
  stderrWidth,
  tabSeparated,
  withSpinner,
  writeStderr,
} from "../../util/ui";
import { searchSubcommand } from "./command";
import {
  commandFor,
  contextLine,
  failureMessage,
  groupLines,
  hitsOf,
  PIPE_HEADINGS,
  pipeRows,
  projectRef,
  serverRef,
} from "./search-view";
import type { Hit, Scope } from "./search-view";

interface Searched {
  readonly profile: string;
  readonly outcomes: readonly Outcome[];
  readonly scope: Scope;
  /** The project `nipa server ls` shows, which the matches mark. Unknown under `-p`. */
  readonly current?: string;
  /** Every project the account can use, to name one that another shares a name with. */
  readonly projects: readonly Project[];
  /** True when `-p` named the project, so the run's own `-p` stays on every suggestion. */
  readonly narrowed: boolean;
}

// With -p there is one project and no fan-out, so it reads like `server ls`.
const searchOne = async (
  client: Client,
  query: string | undefined
): Promise<Searched> => {
  const { active, session, space } = await client.cloud();
  const { project } = session;
  const outcome = await withSpinner(
    `Searching ${oneLine(project.name)}…`,
    async () => searchedProject(project, await listServers(space), query)
  );
  return {
    narrowed: true,
    outcomes: [outcome],
    profile: active.name,
    projects: [project],
    scope: { kind: "project", name: project.name },
  };
};

// Without -p it reads every project, from the saved session: a folder's link
// names one project and must not narrow a search for all of them.
const searchAll = async (
  client: Client,
  query: string | undefined
): Promise<Searched> => {
  const active = await client.profile();
  const spaceUrl = requireSpaceUrl(active);
  announceProfile(active);
  const { session } = await client.savedSession();
  const projects = await listedProjects(active, session);
  if (projects.length === 0) {
    throw new CliError("your account has no projects you can use");
  }
  const outcomes = await withSpinner(
    `Searching ${plural(projects.length, "project")}…`,
    () => searchProjects({ active, projects, query, session, spaceUrl })
  );
  const failed = outcomes.filter(isFailed).length;
  return {
    current: session.project.id,
    narrowed: false,
    outcomes,
    profile: active.name,
    projects,
    scope: {
      kind: "projects",
      searched: projects.length - failed,
      total: projects.length,
    },
  };
};

const hitsLog = (found: Searched, hits: readonly Hit[]): void => {
  const [only] = hits;
  const scope = runScope();
  const project = (hit: Hit) =>
    found.narrowed ? undefined : projectRef(hit.project, found.projects);
  if (only && hits.length === 1) {
    const command = commandFor({
      command: `nipa server inspect ${serverRef(only)}`,
      project: project(only),
      scope,
    });
    log(`Run \`${command}\` to see its details.`);
  } else if (hits.length > 1) {
    log(
      found.narrowed
        ? "Act on one with `nipa server <verb> <name or ID>`."
        : "Act on one with `nipa -p <project> server <verb> <name or ID>`."
    );
  }
};

const reportFailures = (found: Searched): number => {
  const failed = found.outcomes.filter(isFailed);
  if (failed.length === 0) {
    return 0;
  }
  const [first] = failed;
  const retry = first
    ? commandFor({
        command: "nipa server ls",
        project: projectRef(first.project, found.projects),
        scope: runScope(),
      })
    : "nipa server ls";
  printError(
    new CliError(failureMessage({ failed, total: found.projects.length }), {
      hint: `Try ${failed.length === 1 ? "it" : "one"} again with \`${retry}\`.`,
    })
  );
  return 1;
};

export const search = handle(
  searchSubcommand,
  async ({ args, client, flags }) => {
    const { query } = args;
    const started = performance.now();
    const found = await (client.project === undefined
      ? searchAll(client, query)
      : searchOne(client, query));
    // Every project failing the same way, such as an expired session, is one error.
    const shared = sharedFailure(found.outcomes);
    if (shared) {
      throw shared;
    }
    const elapsed = formatElapsed(performance.now() - started);
    const hits = hitsOf(found.outcomes);
    const failed = found.outcomes.filter(isFailed);
    if (flags.json) {
      client.stdout.json({
        failed: failed.map(({ failure, project }) => ({
          message: failure.message,
          project,
          status: failure.status,
        })),
        profile: found.profile,
        query: query === undefined || query === "" ? null : query,
        searched: found.outcomes.length - failed.length,
        servers: hits.map(({ project, server }) => ({ ...server, project })),
        total: found.outcomes.length,
      });
      // The document is the result, so a failed project adds no error document.
      return failed.length > 0 ? 1 : 0;
    }
    if (found.outcomes.length > failed.length) {
      log(
        contextLine({ elapsed, hits: hits.length, query, scope: found.scope })
      );
    }
    if (client.stdout.isTTY) {
      for (const line of groupLines({
        current: found.current,
        hits,
        projects: found.projects,
        width: stderrWidth(),
      })) {
        writeStderr(line);
      }
      hitsLog(found, hits);
    } else {
      // A pipe gets the rows, so grep and cut see one server per line.
      client.stdout.line(tabSeparated(PIPE_HEADINGS, pipeRows(hits)));
    }
    return isJsonMode() ? 0 : reportFailures(found);
  }
);

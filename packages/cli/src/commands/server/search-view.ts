// What `nipa server search` prints, as pure functions of the outcomes: the
// context line, the groups under it, the rows of a pipe, the list of projects
// that failed, and the commands it suggests.

import { mainAddress } from "../../util/compute";
import type { Server } from "../../util/compute";
import type { Project } from "../../util/keystone";
import { shellQuote, suggest } from "../../util/scope";
import type { RunScope } from "../../util/scope";
import { isSearched } from "../../util/server-search";
import type { Failed, Outcome } from "../../util/server-search";
import { statusCell, statusLabel } from "../../util/status";
import { bold, dim, oneLine, plural } from "../../util/ui";
import type { Cell } from "../../util/ui";
import { nameCell } from "./format";
import { isoTime } from "./ls";

/** A match, with the project it is in. */
export interface Hit {
  readonly project: Project;
  readonly server: Server;
  /** True when another server in the project has the same name, so the name can't pick it. */
  readonly nameRepeats: boolean;
}

export const hitsOf = (outcomes: readonly Outcome[]): Hit[] =>
  outcomes.filter(isSearched).flatMap(({ project, repeated, servers }) =>
    servers.map((server) => ({
      nameRepeats: repeated.has(server.name),
      project,
      server,
    }))
  );

/** What the search covered: every project, or the one `-p` named. */
export type Scope =
  | {
      readonly kind: "projects";
      readonly searched: number;
      readonly total: number;
    }
  | { readonly kind: "project"; readonly name: string };

const where = (scope: Scope): string => {
  if (scope.kind === "project") {
    return bold(oneLine(scope.name));
  }
  // A search that skipped a project never claims to have covered them all.
  return scope.searched === scope.total
    ? plural(scope.total, "project")
    : `${scope.searched} of ${scope.total} projects`;
};

/**
 * The first line: what was found and where, with how long it took. A search
 * with no matches says what it looked for, and in how many projects.
 */
export const contextLine = (input: {
  query?: string;
  hits: number;
  scope: Scope;
  elapsed: string;
}): string => {
  const { elapsed, hits, query, scope } = input;
  const quoted =
    query === undefined || query === "" ? undefined : `"${oneLine(query)}"`;
  const tag = dim(`[${elapsed}]`);
  const place = where(scope);
  if (hits === 0) {
    const nothing = quoted
      ? `No servers match ${quoted} in ${place}.`
      : `No servers in ${place}.`;
    return `${nothing} ${tag}`;
  }
  const servers = plural(hits, "server");
  const verb = hits === 1 ? "matches" : "match";
  const found = quoted
    ? `${servers} ${verb} ${quoted} in ${place}`
    : `${servers} in ${place}`;
  return `${found} ${tag}`;
};

const GAP = " ".repeat(3);
const ROW_INDENT = "    ";
const DETAIL_INDENT = "      ";

interface Row {
  readonly name: Cell;
  readonly status: Cell;
  readonly address: string;
  /** The ID, shown under a row whose name the project repeats. */
  readonly id: string | undefined;
}

interface Group {
  readonly project: Project;
  readonly rows: Row[];
}

// A remote name or address prints on one line and carries no escape.
const safe = (cell: Cell): Cell => ({
  ...cell,
  short: cell.short && safe(cell.short),
  text: oneLine(cell.text),
});

const rowOf = (hit: Hit): Row => ({
  address: oneLine(mainAddress(hit.server) ?? "-"),
  id: hit.nameRepeats ? oneLine(hit.server.id) : undefined,
  name: safe(nameCell(hit.server)),
  status: statusCell(hit.server.status),
});

const painted = (cell: Cell, width = 0): string => {
  const text = cell.text.padEnd(width);
  return cell.paint ? cell.paint(text) : text;
};

const widest = (texts: readonly string[]): number =>
  Math.max(0, ...texts.map((text) => text.length));

const idLine = (row: Row): string[] => {
  if (row.id === undefined) {
    return [];
  }
  const label = dim(`ID ${row.id}`);
  return [`${DETAIL_INDENT}${label}`];
};

const groupsOf = (hits: readonly Hit[]): Group[] => {
  const groups = new Map<string, Group>();
  for (const hit of hits) {
    const group = groups.get(hit.project.id) ?? {
      project: hit.project,
      rows: [],
    };
    group.rows.push(rowOf(hit));
    groups.set(hit.project.id, group);
  }
  return [...groups.values()];
};

const headingOf = (group: Group, current: string | undefined): string =>
  `  ${bold(oneLine(group.project.name))}${
    group.project.id === current ? ` ${dim("(current)")}` : ""
  }`;

interface Layout {
  readonly lines: string[];
  readonly width: number;
}

const tableLayout = (input: {
  groups: readonly Group[];
  current: string | undefined;
  names: "full" | "short";
}): Layout => {
  const { current, groups, names } = input;
  const rows = groups.flatMap((group) => group.rows);
  const pick = (row: Row): Cell =>
    names === "short" ? (row.name.short ?? row.name) : row.name;
  const nameWidth = widest(rows.map((row) => pick(row).text));
  const statusWidth = widest(rows.map((row) => row.status.text));
  const width =
    ROW_INDENT.length +
    nameWidth +
    GAP.length +
    statusWidth +
    GAP.length +
    widest(rows.map((row) => row.address));
  const lines = groups.flatMap((group) => [
    "",
    headingOf(group, current),
    ...group.rows.flatMap((row) => [
      `${ROW_INDENT}${painted(pick(row), nameWidth)}${GAP}${painted(row.status, statusWidth)}${GAP}${row.address}`,
      ...idLine(row),
    ]),
  ]);
  return { lines, width };
};

// A terminal too narrow for a row gets a record per server: the name on one
// line, and its status and address beneath.
const recordLines = (
  groups: readonly Group[],
  current: string | undefined
): string[] =>
  groups.flatMap((group) => [
    "",
    headingOf(group, current),
    ...group.rows.flatMap((row) => [
      `${ROW_INDENT}${painted(row.name.short ?? row.name)}`,
      `${DETAIL_INDENT}${painted(row.status)}${GAP}${row.address}`,
      ...idLine(row),
    ]),
  ]);

/**
 * The matches under their projects, for a terminal `width` columns wide. A
 * row gives way when it doesn't fit: first a Kubernetes node's role
 * shortens, then each server takes two lines. A name, an ID and an address
 * are never cut. Each group starts after a blank line and the last is
 * followed by one, so the lines sit between the context line and the next
 * step. `current` is the ID of the project `nipa server ls` shows.
 */
export const groupLines = (input: {
  hits: readonly Hit[];
  width: number;
  current?: string;
}): string[] => {
  const groups = groupsOf(input.hits);
  if (groups.length === 0) {
    return [];
  }
  const { current, width } = input;
  const layouts = (["full", "short"] as const).map((names) =>
    tableLayout({ current, groups, names })
  );
  const fits = layouts.find((layout) => layout.width <= width);
  return [...(fits?.lines ?? recordLines(groups, current)), ""];
};

export const PIPE_HEADINGS = [
  "ID",
  "Name",
  "Project",
  "Status",
  "Address",
  "Flavor",
  "Created",
];

/**
 * One row per match for a pipe. Every field a script can use: the ID that
 * the next command takes, the bare name even for a Kubernetes node, the
 * project's name, and an ISO time.
 */
export const pipeRows = (hits: readonly Hit[]): string[][] =>
  hits.map(({ project, server }) => [
    server.id,
    server.name,
    project.name,
    statusLabel(server.status),
    mainAddress(server) ?? "",
    server.flavor,
    isoTime(server.createdAt),
  ]);

/** The most failed projects listed by name. */
const LISTED_FAILURES = 5;

/**
 * One line for each failed project, `  Finance: You are not allowed to list
 * servers`, and `  and 12 more` after the first five.
 */
export const failureLines = (failed: readonly Failed[]): string[] => {
  const lines = failed
    .slice(0, LISTED_FAILURES)
    .map(
      ({ failure, project }) =>
        `  ${oneLine(project.name)}: ${oneLine(failure.message)}`
    );
  const more = failed.length - LISTED_FAILURES;
  return more > 0 ? [...lines, `  and ${more} more`] : lines;
};

/** The message of the error that follows a search that skipped projects. */
export const failureMessage = (input: {
  failed: readonly Failed[];
  total: number;
}): string => {
  const { failed, total } = input;
  const searched = total - failed.length;
  return [
    `Searched ${searched} of ${total} projects. ${failed.length} failed.`,
    ...failureLines(failed),
  ].join("\n");
};

/**
 * How a command names a project of another run: its name, or its ID when
 * another project in the account has that name too.
 */
export const projectRef = (
  project: Project,
  projects: readonly Project[]
): string =>
  projects.some(
    (other) => other.id !== project.id && other.name === project.name
  )
    ? project.id
    : project.name;

/**
 * A command for a match, in the profile this run named and in the project of
 * the match. Under `-p` the run's own project stays.
 */
export const commandFor = (input: {
  /** The plain command, such as `nipa server inspect web-1`. */
  command: string;
  /** The project to name, or undefined to leave it to the run's `-p`. */
  project?: string;
  scope?: RunScope;
}): string => {
  const { command, project, scope } = input;
  if (!scope) {
    return command;
  }
  const named = project === undefined ? scope : { ...scope, project };
  return suggest(command, named).command;
};

/**
 * The server a command takes: its name, or its ID when the project has more
 * than one by that name, quoted for the shell.
 */
export const serverRef = (hit: Hit): string =>
  shellQuote(hit.nameRepeats ? hit.server.id : hit.server.name);

import { handle } from "../../util/command";
import { inspectDatabase } from "../../util/database";
import type {
  DatabaseBackup,
  DatabaseDetail,
  DatabaseInstance,
  DatabaseLog,
  DatabaseReplica,
} from "../../util/database";
import { DATABASES, findResource } from "../../util/find";
import { statusCell, statusLabel } from "../../util/status";
import {
  andList,
  bold,
  dim,
  flavorCell,
  formatAge,
  formatElapsed,
  gray,
  log,
  note,
  printFields,
  withDetail,
  withSpinner,
} from "../../util/ui";
import type { Cell, Field } from "../../util/ui";
import { inspectSubcommand } from "./command";
import { databaseProblems, describeProblem } from "./health";
import type { DatabaseProblem } from "./health";

const RECENT_BACKUPS = 5;

const ago = (time: string, now: number): string =>
  `${formatAge(now - Date.parse(time))} ago`;

const withPort = (address: string, port: number | null): string =>
  port === null ? address : `${address}:${port}`;

// A status dot and label, then a name and a dim detail, such as
// "● Completed  nightly (0.2 GB, 1d ago)".
const statusLine = (status: string, name: string, detail: string): Cell => {
  const cell = statusCell(status);
  const dot = cell.paint?.(cell.text) ?? cell.text;
  const named = name ? `  ${name}` : "";
  return {
    paint: () => `${dot}${named}${dim(detail)}`,
    text: `${cell.text}${named}${detail}`,
  };
};

const healthCell = (primary: DatabaseInstance, now: number): Cell =>
  primary.healthCheckedAt
    ? statusLine(
        primary.health,
        "",
        ` (checked ${ago(primary.healthCheckedAt, now)})`
      )
    : statusCell(primary.health);

const addressCells = (
  primary: DatabaseInstance,
  port: number | null
): Cell[] => {
  const internal = { text: withPort(primary.address, port) };
  if (!primary.externalAddress) {
    return [internal];
  }
  const external = withPort(primary.externalAddress, port);
  return [withDetail(external, " (external)"), internal];
};

const logCell = (entry: DatabaseLog): Cell => {
  const state = [entry.status.toLowerCase()];
  if (entry.publishedBytes > 0) {
    const mb = Number((entry.publishedBytes / 1024 / 1024).toFixed(1));
    state.push(`${mb} MB`);
  }
  return withDetail(statusLabel(entry.name), ` (${state.join(", ")})`);
};

const backupCell = (backup: DatabaseBackup, now: number): Cell => {
  const size =
    backup.sizeGb === null ? [] : [`${Number(backup.sizeGb.toFixed(2))} GB`];
  const detail = [...size, ago(backup.createdAt, now)].join(", ");
  return statusLine(backup.status, backup.name, ` (${detail})`);
};

// What a part shows when the Space API didn't answer for it.
const UNAVAILABLE: Cell = { paint: dim, text: "Unavailable" };

const replicaCell = (replica: DatabaseReplica): Cell =>
  statusLine(
    replica.status,
    replica.name,
    replica.address ? ` (${replica.address})` : ""
  );

const replicaCells = (replicas: readonly DatabaseReplica[]): Cell[] =>
  replicas.length === 0 ? [{ text: "None" }] : replicas.map(replicaCell);

const backupCells = (
  backups: readonly DatabaseBackup[],
  now: number
): Cell[] => {
  if (backups.length === 0) {
    return [{ text: "None" }];
  }
  const cells = backups.slice(0, RECENT_BACKUPS).map((b) => backupCell(b, now));
  const more = backups.length - RECENT_BACKUPS;
  if (more > 0) {
    cells.push({ paint: dim, text: `and ${more} more in --json` });
  }
  return cells;
};

const primaryFields = (
  database: DatabaseDetail,
  primary: DatabaseInstance,
  now: number
): Field[] => [
  {
    label: "Engine",
    lines: [{ text: `${primary.engine} ${primary.version}` }],
  },
  { label: "Status", lines: [statusCell(primary.status)] },
  { label: "Health", lines: [healthCell(primary, now)] },
  { label: "Flavor", lines: [flavorCell(primary)] },
  { label: "Storage", lines: [{ text: `${primary.storageGb} GB` }] },
  { label: "Zone", lines: primary.zone ? [{ text: primary.zone }] : [] },
  { label: "Address", lines: addressCells(primary, database.defaultPort) },
  {
    label: "Allowed CIDRs",
    lines:
      primary.allowedCidrs.length === 0
        ? [{ text: "None set" }]
        : primary.allowedCidrs.map((text) => ({ text })),
  },
  {
    label: "Replicas",
    lines: database.replicas ? replicaCells(database.replicas) : [UNAVAILABLE],
  },
  { label: "Logs", lines: database.logs?.map(logCell) ?? [UNAVAILABLE] },
  {
    label: "Backups",
    lines: database.backups
      ? backupCells(database.backups, now)
      : [UNAVAILABLE],
  },
];

// The parts the Space API didn't answer for, as "replicas and backups".
const unavailableParts = (database: DatabaseDetail): string[] =>
  (["replicas", "logs", "backups"] as const).filter(
    (part) => database[part] === null
  );

const fieldsOf = (database: DatabaseDetail, now: number): Field[] => [
  { label: "ID", lines: [{ text: database.id }] },
  ...(database.primary
    ? primaryFields(database, database.primary, now)
    : [{ label: "Status", lines: [] }]),
  {
    label: "Created",
    lines: [{ paint: gray, text: ago(database.createdAt, now) }],
  },
];

const printVerdict = (
  database: DatabaseDetail,
  problems: readonly DatabaseProblem[]
): void => {
  const name = bold(database.name);
  const missing = unavailableParts(database);
  if (missing.length > 0) {
    note(
      `The Space API didn't answer for the ${andList(missing)} of ${name}, so the verdict leaves them out. Run the command again, or with --debug to see the requests.`
    );
  }
  if (problems.length > 0) {
    note(`${name} needs attention: ${andList(problems.map(describeProblem))}.`);
    return;
  }
  const { primary } = database;
  if (primary) {
    const address = withPort(
      primary.externalAddress ?? primary.address,
      database.defaultPort
    );
    log(`${name} is healthy. Connect to it at ${bold(address)}.`);
  }
};

export const inspect = handle(
  inspectSubcommand,
  async ({ args, client, flags }) => {
    const { active, session, space } = await client.cloud();
    const { project } = session;
    const started = performance.now();
    const found = await findResource({
      kind: DATABASES,
      projectName: project.name,
      ref: args.database,
      space,
    });
    const database = await withSpinner(
      `Loading the replicas, logs and backups of ${found.name}…`,
      () => inspectDatabase(space, found)
    );
    const problems = databaseProblems(database);
    if (flags.json) {
      client.stdout.json({
        database: { ...database, problems },
        profile: active.name,
        project,
      });
      return 0;
    }
    const elapsed = dim(`[${formatElapsed(performance.now() - started)}]`);
    log(`Database ${bold(database.name)} in ${bold(project.name)} ${elapsed}`);
    printFields(fieldsOf(database, Date.now()));
    printVerdict(database, problems);
    if (!client.stdout.isTTY) {
      client.stdout.line(database.id);
    }
    return 0;
  }
);

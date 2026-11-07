import { handle } from "../../util/command";
import { listServers, mainAddress } from "../../util/compute";
import type { Server } from "../../util/compute";
import { statusCell, statusLabel } from "../../util/status";
import {
  bold,
  dim,
  formatAge,
  formatElapsed,
  gray,
  log,
  printTable,
  stderrWidth,
  oneLine,
  tabSeparated,
  withSpinner,
} from "../../util/ui";
import { lsSubcommand } from "./command";
import { nameCell } from "./format";

const PIPE_HEADINGS = ["ID", "Name", "Status", "Address", "Flavor", "Created"];
const FLAVOR = 3;
const AGE = 4;

/**
 * Fits the terminal by dropping Flavor, then Age, then shortening the
 * Kubernetes role, then printing a record per server.
 */
export const printServers = (
  servers: readonly Server[],
  now: number,
  width: number
): void => {
  printTable({
    fit: { droppable: [FLAVOR, AGE], width },
    headings: ["Name", "Status", "Address", "Flavor", "Age"],
    rows: servers.map((server) => [
      nameCell(server),
      statusCell(server.status),
      { text: mainAddress(server) ?? "-" },
      { text: server.flavor },
      { paint: gray, text: formatAge(now - Date.parse(server.createdAt)) },
    ]),
  });
};

export const isoTime = (time: string): string => {
  const ms = Date.parse(time);
  return Number.isNaN(ms) ? time : new Date(ms).toISOString();
};

// Every field a script can use: the ID that the next command takes, an ISO
// time, and the bare name, even for a Kubernetes node.
export const pipeRows = (servers: readonly Server[]): string[][] =>
  servers.map((server) => [
    server.id,
    server.name,
    statusLabel(server.status),
    mainAddress(server) ?? "",
    server.flavor,
    isoTime(server.createdAt),
  ]);

export const ls = handle(lsSubcommand, async ({ client, flags }) => {
  const { active, session, space } = await client.cloud();
  const { project } = session;
  const started = performance.now();
  const servers = await withSpinner(
    `Loading the servers in ${project.name}…`,
    () => listServers(space)
  );
  if (flags.json) {
    client.stdout.json({ profile: active.name, project, servers });
    return 0;
  }
  const elapsed = dim(`[${formatElapsed(performance.now() - started)}]`);
  log(
    servers.length === 0
      ? `No servers in ${bold(oneLine(project.name))} ${elapsed}`
      : `Servers in ${bold(oneLine(project.name))} ${elapsed}`
  );
  if (!client.stdout.isTTY) {
    // A pipe gets the table's rows, so grep and cut see one server per line.
    client.stdout.line(tabSeparated(PIPE_HEADINGS, pipeRows(servers)));
  } else if (servers.length > 0) {
    printServers(servers, Date.now(), stderrWidth());
  }
  return 0;
});

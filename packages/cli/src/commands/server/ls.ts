import { handle } from "../../util/command";
import { listServers } from "../../util/compute";
import type { Server } from "../../util/compute";
import { statusCell } from "../../util/status";
import {
  bold,
  dim,
  formatAge,
  formatElapsed,
  gray,
  log,
  printTable,
  withSpinner,
} from "../../util/ui";
import { lsSubcommand } from "./command";
import { mainAddress, nameCell } from "./format";

const FLAVOR = 3;
const AGE = 4;
const DEFAULT_WIDTH = 80;

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
  if (servers.length === 0) {
    log(`No servers in ${bold(project.name)} ${elapsed}`);
    return 0;
  }
  log(`Servers in ${bold(project.name)} ${elapsed}`);
  printServers(servers, Date.now(), process.stderr.columns || DEFAULT_WIDTH);
  // A pipe gets one ID per line, because two servers can share a name.
  if (!client.stdout.isTTY) {
    client.stdout.line(servers.map((server) => server.id).join("\n"));
  }
  return 0;
});

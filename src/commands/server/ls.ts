import { listServers } from "../../lib/compute";
import type { Server } from "../../lib/compute";
import {
  bold,
  dim,
  formatAge,
  formatElapsed,
  gray,
  log,
  printTable,
  withSpinner,
} from "../../lib/ui";
import { handle } from "../../util/command";
import { lsSubcommand } from "./command";
import { mainAddress, statusCell } from "./format";

const printServers = (servers: readonly Server[], now: number): void => {
  printTable({
    headings: ["Name", "Status", "Address", "Flavor", "Age"],
    rows: servers.map((server) => [
      { text: server.name },
      statusCell(server.status),
      { text: mainAddress(server) ?? "-" },
      { text: server.flavor },
      { paint: gray, text: formatAge(now - Date.parse(server.createdAt)) },
    ]),
  });
};

export const ls = handle(lsSubcommand, async ({ client, flags }) => {
  const { active, service, session } = await client.cloud();
  const { project } = session;
  const started = performance.now();
  const servers = await withSpinner(
    `Loading the servers in ${project.name}…`,
    async () => listServers(await service("compute"))
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
  printServers(servers, Date.now());
  // A pipe gets one ID per line, because two servers can share a name.
  if (!client.stdout.isTTY) {
    client.stdout.line(servers.map((server) => server.id).join("\n"));
  }
  return 0;
});

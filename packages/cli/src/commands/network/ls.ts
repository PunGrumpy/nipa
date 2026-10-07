import { handle } from "../../util/command";
import { listNetworks } from "../../util/network";
import type { Network } from "../../util/network";
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

const printNetworks = (networks: readonly Network[], now: number): void => {
  printTable({
    headings: ["Name", "Status", "Type", "Zone", "Age"],
    rows: networks.map((network) => [
      { text: network.name },
      statusCell(network.status),
      { text: network.external ? "external" : "VPC" },
      { text: network.zone ?? "-" },
      { paint: gray, text: formatAge(now - Date.parse(network.createdAt)) },
    ]),
  });
};

export const ls = handle(lsSubcommand, async ({ client, flags }) => {
  const { active, session, space } = await client.cloud();
  const { project } = session;
  const started = performance.now();
  const networks = await withSpinner(
    `Loading the networks in ${project.name}…`,
    () => listNetworks(space)
  );
  if (flags.json) {
    client.stdout.json({ networks, profile: active.name, project });
    return 0;
  }
  const elapsed = dim(`[${formatElapsed(performance.now() - started)}]`);
  if (networks.length === 0) {
    log(`No networks in ${bold(project.name)} ${elapsed}`);
    return 0;
  }
  log(`Networks in ${bold(project.name)} ${elapsed}`);
  printNetworks(networks, Date.now());
  // A pipe gets one ID per line, because two networks can share a name.
  if (!client.stdout.isTTY) {
    client.stdout.line(networks.map((network) => network.id).join("\n"));
  }
  return 0;
});

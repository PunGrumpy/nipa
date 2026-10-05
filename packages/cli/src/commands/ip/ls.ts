import { handle } from "../../util/command";
import { listExternalIps } from "../../util/external-ip";
import type { ExternalIp } from "../../util/external-ip";
import { statusCell } from "../../util/status";
import {
  bold,
  dim,
  formatElapsed,
  log,
  printTable,
  withSpinner,
} from "../../util/ui";
import { lsSubcommand } from "./command";

const printIps = (ips: readonly ExternalIp[]): void => {
  printTable({
    headings: ["Address", "Status", "Internal IP", "Zone", "Name"],
    rows: ips.map((ip) => [
      { text: ip.address },
      statusCell(ip.status),
      { text: ip.internalAddress ?? "-" },
      { text: ip.zone },
      { text: ip.name },
    ]),
  });
};

export const ls = handle(lsSubcommand, async ({ client, flags }) => {
  const { active, session, space } = await client.cloud();
  const { project } = session;
  const started = performance.now();
  const ips = await withSpinner(
    `Loading the external IPs in ${project.name}…`,
    () => listExternalIps(space)
  );
  if (flags.json) {
    client.stdout.json({ ips, profile: active.name, project });
    return 0;
  }
  const elapsed = dim(`[${formatElapsed(performance.now() - started)}]`);
  if (ips.length === 0) {
    log(`No external IPs in ${bold(project.name)} ${elapsed}`);
    return 0;
  }
  log(`External IPs in ${bold(project.name)} ${elapsed}`);
  printIps(ips);
  // A pipe gets one address per line, which is unique.
  if (!client.stdout.isTTY) {
    client.stdout.line(ips.map((ip) => ip.address).join("\n"));
  }
  return 0;
});

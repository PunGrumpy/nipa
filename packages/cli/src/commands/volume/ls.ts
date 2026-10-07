import { handle } from "../../util/command";
import { listServers } from "../../util/compute";
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
import { listVolumes } from "../../util/volume";
import type { Volume } from "../../util/volume";
import { lsSubcommand } from "./command";

const printVolumes = (input: {
  volumes: readonly Volume[];
  /** Server names by ID, for the servers the volumes are attached to. */
  serverNames: ReadonlyMap<string, string>;
  now: number;
}): void => {
  const { now, serverNames, volumes } = input;
  printTable({
    headings: ["Name", "Status", "Size", "Type", "Server", "Age"],
    rows: volumes.map((volume) => {
      const servers = volume.attachments.map(
        ({ serverId }) => serverNames.get(serverId) ?? serverId
      );
      return [
        { text: volume.name || "-" },
        statusCell(volume.status),
        { text: `${volume.sizeGb} GB` },
        { text: volume.type ?? "-" },
        { text: servers.length > 0 ? servers.join(", ") : "-" },
        { paint: gray, text: formatAge(now - Date.parse(volume.createdAt)) },
      ];
    }),
  });
};

export const ls = handle(lsSubcommand, async ({ client, flags }) => {
  const { active, session, space } = await client.cloud();
  const { project } = session;
  const started = performance.now();
  const loading = `Loading the volumes in ${project.name}…`;
  if (flags.json) {
    const volumes = await withSpinner(loading, () => listVolumes(space));
    client.stdout.json({ profile: active.name, project, volumes });
    return 0;
  }
  // The table names each volume's server, which the volume knows only by ID.
  const [volumes, servers] = await withSpinner(loading, () =>
    Promise.all([listVolumes(space), listServers(space)])
  );
  const elapsed = dim(`[${formatElapsed(performance.now() - started)}]`);
  if (volumes.length === 0) {
    log(`No volumes in ${bold(project.name)} ${elapsed}`);
    return 0;
  }
  log(`Volumes in ${bold(project.name)} ${elapsed}`);
  printVolumes({
    now: Date.now(),
    serverNames: new Map(servers.map((server) => [server.id, server.name])),
    volumes,
  });
  // A pipe gets one ID per line, because two volumes can share a name.
  if (!client.stdout.isTTY) {
    client.stdout.line(volumes.map((volume) => volume.id).join("\n"));
  }
  return 0;
});

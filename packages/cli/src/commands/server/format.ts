// How nipa shows a server, for every server subcommand.

import type { Server, Volume } from "../../util/compute";
import { withDetail } from "../../util/ui";
import type { Cell } from "../../util/ui";

/**
 * The server's name, and a dim "(Kubernetes master)" on a cluster's node,
 * which shortens to "(master)" in a table that is too wide.
 */
export const nameCell = (server: Server): Cell => {
  if (!server.kubernetes) {
    return { text: server.name };
  }
  const role = server.kubernetes.role ?? "node";
  return {
    ...withDetail(server.name, ` (Kubernetes ${role})`),
    short: withDetail(server.name, ` (${role})`),
  };
};

export const addressCells = (server: Server): Cell[] => {
  const external = server.addresses.filter((a) => a.type === "floating");
  const internal = server.addresses.filter((a) => a.type === "fixed");
  return [
    ...external.map((a) => withDetail(a.address, " (external)")),
    ...internal.map((a) => ({ text: a.address })),
  ];
};

const volumeCell = (volume: Volume): Cell => {
  const kind = [`${volume.sizeGb} GB`, volume.type].filter(Boolean).join(" ");
  const detail = [kind, volume.attachedAs].filter(Boolean).join(", ");
  return withDetail(volume.name ?? volume.id, ` (${detail})`);
};

export const volumeCells = (server: Server): Cell[] =>
  server.volumes.map(volumeCell);

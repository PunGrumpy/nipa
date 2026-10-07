// How nipa shows a server, for every server subcommand.

import type { Server, Volume } from "../../util/compute";
import { dim, plural } from "../../util/ui";
import type { Cell } from "../../util/ui";

/** The address people reach the server at: a floating IP, then IPv4. */
export const mainAddress = (server: Server): string | undefined => {
  const v4 = server.addresses.filter((a) => a.version === 4);
  const best =
    v4.find((a) => a.type === "floating") ?? v4[0] ?? server.addresses[0];
  return best?.address;
};

/** The server's name, and a dim "(Kubernetes master)" on a cluster's node. */
export const nameCell = (server: Server): Cell => {
  if (!server.kubernetes) {
    return { text: server.name };
  }
  const role = server.kubernetes.role ?? "node";
  return {
    paint: (text) => `${server.name}${dim(text.slice(server.name.length))}`,
    text: `${server.name} (Kubernetes ${role})`,
  };
};

export const withDetail = (text: string, detail: string): Cell => ({
  paint: () => `${text}${dim(detail)}`,
  text: `${text}${detail}`,
});

const gigabytes = (mb: number): string =>
  `${Number((mb / 1024).toFixed(1))} GB`;

export const flavorCell = (server: Server): Cell => {
  const size: string[] = [];
  if (server.vcpus !== null) {
    size.push(plural(server.vcpus, "vCPU"));
  }
  if (server.ramMb !== null) {
    size.push(`${gigabytes(server.ramMb)} RAM`);
  }
  return size.length === 0
    ? { text: server.flavor }
    : withDetail(server.flavor, ` (${size.join(", ")})`);
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

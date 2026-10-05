// How nipa shows a server, for every server subcommand.

import type { Server } from "../../util/compute";
import { dim } from "../../util/ui";
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

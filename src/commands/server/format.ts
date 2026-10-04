// How nipa shows a server, for every server subcommand.

import type { Server } from "../../lib/compute";
import { gray, green, red, yellow } from "../../lib/ui";
import type { Cell, Paint } from "../../lib/ui";

// Nova's statuses: ACTIVE runs, these fail or are on their way somewhere,
// and the rest, such as SHUTOFF or SHELVED, are stopped.
const STATUS_COLORS = new Map<string, Paint>([
  ["ACTIVE", green],
  ["BUILD", yellow],
  ["ERROR", red],
  ["HARD_REBOOT", yellow],
  ["MIGRATING", yellow],
  ["PASSWORD", yellow],
  ["REBOOT", yellow],
  ["REBUILD", yellow],
  ["RESCUE", yellow],
  ["RESIZE", yellow],
  ["REVERT_RESIZE", yellow],
  ["UNKNOWN", red],
  ["VERIFY_RESIZE", yellow],
]);

/** HARD_REBOOT reads as "Hard reboot". */
export const statusLabel = (status: string): string => {
  const words = status.toLowerCase().replaceAll("_", " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
};

/** The address people reach the server at: a floating IP, then IPv4. */
export const mainAddress = (server: Server): string | undefined => {
  const v4 = server.addresses.filter((a) => a.version === 4);
  const best =
    v4.find((a) => a.type === "floating") ?? v4[0] ?? server.addresses[0];
  return best?.address;
};

// Like the Vercel CLI, only the dot takes the status color.
export const statusCell = (status: string): Cell => {
  const paint = STATUS_COLORS.get(status) ?? gray;
  return {
    paint: (text) => `${paint("●")}${text.slice(1)}`,
    text: `● ${statusLabel(status)}`,
  };
};

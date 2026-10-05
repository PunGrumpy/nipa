// How nipa shows a resource's status in a table, for every resource command.

import { gray, green, red, yellow } from "./ui";
import type { Cell, Paint } from "./ui";

// OpenStack's statuses: these run or answer, these fail, and these are on
// their way somewhere. The rest, such as SHUTOFF, SHELVED or DOWN, are gray.
const RUNNING = new Set(["ACTIVE", "HEALTHY", "ONLINE"]);
const FAILING = new Set(["DEGRADED", "ERROR", "OFFLINE", "UNKNOWN"]);
const CHANGING = new Set([
  "BUILD",
  "HARD_REBOOT",
  "MIGRATING",
  "PASSWORD",
  "REBOOT",
  "REBUILD",
  "RESCUE",
  "RESIZE",
  "REVERT_RESIZE",
  "VERIFY_RESIZE",
]);

const paintFor = (status: string): Paint => {
  if (RUNNING.has(status)) {
    return green;
  }
  if (FAILING.has(status)) {
    return red;
  }
  if (CHANGING.has(status) || status.startsWith("PENDING_")) {
    return yellow;
  }
  return gray;
};

/** HARD_REBOOT reads as "Hard reboot". */
export const statusLabel = (status: string): string => {
  const words = status.toLowerCase().replaceAll("_", " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
};

// Like the Vercel CLI, only the dot takes the status color.
export const statusCell = (status: string): Cell => {
  const paint = paintFor(status);
  return {
    paint: (text) => `${paint("●")}${text.slice(1)}`,
    text: `● ${statusLabel(status)}`,
  };
};

// How nipa shows a resource's status in a table, for every resource command.

import { gray, green, red, yellow } from "./ui";
import type { Cell, Paint } from "./ui";

// OpenStack's statuses: these run, answer or finished, these fail, and these
// are on their way somewhere. The rest, such as SHUTOFF, SHELVED or DOWN, are gray.
// Cinder writes its statuses in lowercase, such as in-use or error_deleting.
const RUNNING = new Set([
  "ACTIVE",
  "AVAILABLE",
  "COMPLETED",
  "HEALTHY",
  "IN-USE",
  "ONLINE",
]);
const FAILING = new Set(["DEGRADED", "FAILED", "OFFLINE", "UNKNOWN"]);
const CHANGING = new Set([
  "ATTACHING",
  "BACKING-UP",
  "BUILD",
  "BUILDING",
  "CREATING",
  "DELETING",
  "DETACHING",
  "DOWNLOADING",
  "EXTENDING",
  "HARD_REBOOT",
  "MIGRATING",
  "NEW",
  "PASSWORD",
  "REBOOT",
  "REBUILD",
  "RESCUE",
  "RESERVED",
  "RESIZE",
  "RESTORING-BACKUP",
  "RETYPING",
  "REVERT_RESIZE",
  "UPLOADING",
  "VERIFY_RESIZE",
]);

/**
 * Whether `status` says something went wrong: FAILED, ERROR and the statuses
 * built on them, such as Trove's DELETE_FAILED or Cinder's error_deleting,
 * and the ones that mean a resource stopped answering. Everything red here
 * counts as a problem for `nipa db inspect`.
 */
export const isFailing = (status: string): boolean => {
  const upper = status.toUpperCase();
  return (
    FAILING.has(upper) || upper.startsWith("ERROR") || upper.endsWith("FAILED")
  );
};

/**
 * Whether `status` says the resource is on its way somewhere, such as BUILD,
 * Cinder's creating or Octavia's PENDING_CREATE.
 */
export const isChanging = (status: string): boolean => {
  const upper = status.toUpperCase();
  return CHANGING.has(upper) || upper.startsWith("PENDING_");
};

const paintFor = (status: string): Paint => {
  if (RUNNING.has(status.toUpperCase())) {
    return green;
  }
  if (isFailing(status)) {
    return red;
  }
  if (isChanging(status)) {
    return yellow;
  }
  return gray;
};

/** HARD_REBOOT reads as "Hard reboot", and in-use as "In use". */
export const statusLabel = (status: string): string => {
  const words = status.toLowerCase().replaceAll(/[_-]/gu, " ");
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

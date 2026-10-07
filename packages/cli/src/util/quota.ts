import { z } from "zod";

import type { Space } from "./api";

// An unlimited quota has a limit of -1. unit is "MB", "GB" or "Bytes" for
// sizes, and absent for counts.
const LimitSchema = z.object({
  group: z.string(),
  limit: z.number(),
  name: z.string(),
  unit: z.string().nullish(),
  unlimited: z.boolean(),
  usage: z.number(),
});

export interface Quota {
  /** The Space API's group, such as compute or sqlDatabase. */
  group: string;
  /** The Space API's name within the group, such as cores or ram. */
  name: string;
  used: number;
  /** Null when the quota is unlimited. */
  limit: number | null;
  unlimited: boolean;
  /** The unit of `used` and `limit`, such as MB, or null for a count. */
  unit: string | null;
}

const toQuota = (line: z.infer<typeof LimitSchema>): Quota => ({
  group: line.group,
  limit: line.unlimited ? null : line.limit,
  name: line.name,
  unit: line.unit ?? null,
  unlimited: line.unlimited,
  used: line.usage,
});

/** Every quota of the project, in the Space API's order. */
export const listQuotas = async (space: Space): Promise<Quota[]> => {
  const lines = await space.getLines("/v4/limits", LimitSchema);
  return lines.map(toQuota);
};

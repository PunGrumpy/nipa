// Names for tab completion: resources from the Space API, and projects from
// Keystone. A Tab press asks again within seconds, so nipa keeps each list
// for a minute. When a new list can't be loaded, a list up to a day old beats
// none: the command that runs still looks the name up live.

import { z } from "zod";

import type { Space } from "./api";
import {
  DATABASES,
  LOAD_BALANCERS,
  NETWORKS,
  SECURITY_GROUPS,
  SERVERS,
  VOLUMES,
} from "./find";
import type { ResourceKind } from "./spec";
import { readCache, writeCache } from "./store";

const CACHE_FILE = "names.json";
const FRESH_MS = 60_000;
const STALE_MS = 24 * 60 * 60_000;

const NamedSchema = z.object({ name: z.string() });

const MachineTypesSchema = z.object({ machine_types: z.array(NamedSchema) });
// ?table=owned_image answers with owned_images, not images.
const OwnedImagesSchema = z.object({ owned_images: z.array(NamedSchema) });
const PublicImagesSchema = z.object({
  public_images: z.array(z.object({ images: z.array(NamedSchema) })),
});

// A resource without a name has nothing to complete to.
const names = (items: readonly { name: string }[]): string[] =>
  items.map((item) => item.name).filter((name) => name !== "");

const load = async (space: Space, kind: ResourceKind): Promise<string[]> => {
  switch (kind) {
    case "servers": {
      return names(await SERVERS.list(space));
    }
    case "volumes": {
      return names(await VOLUMES.list(space));
    }
    case "networks": {
      return names(await NETWORKS.list(space));
    }
    case "security-groups": {
      return names(await SECURITY_GROUPS.list(space));
    }
    case "load-balancers": {
      return names(await LOAD_BALANCERS.list(space));
    }
    case "databases": {
      return names(await DATABASES.list(space));
    }
    case "flavors": {
      const body = await space.get("/v4/machine_types", MachineTypesSchema);
      return names(body.machine_types);
    }
    case "images": {
      const [shared, owned] = await Promise.all([
        space.get("/v4/public_images", PublicImagesSchema),
        space.get("/v4/images?table=owned_image", OwnedImagesSchema),
      ]);
      return [
        ...shared.public_images.flatMap((group) => names(group.images)),
        ...names(owned.owned_images),
      ];
    }
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
};

const CacheSchema = z.record(
  z.string(),
  z.object({ at: z.number(), names: z.array(z.string()) })
);

/**
 * The names saved under `key`, or what `load` finds. The one place the cache
 * rules live: a list younger than FRESH_MS is used as it is, and when `load`
 * fails for any reason a list younger than STALE_MS stands in. Never throws
 * for a failed load.
 */
export const cachedNames = async (input: {
  key: string;
  /** Runs only when the saved list is older than FRESH_MS. */
  load: () => Promise<string[]>;
  now?: number;
}): Promise<string[]> => {
  const now = input.now ?? Date.now();
  const { key } = input;
  const cache = (await readCache(CACHE_FILE, CacheSchema)) ?? {};
  const hit = cache[key];
  if (hit && now - hit.at < FRESH_MS) {
    return hit.names;
  }
  let found: string[];
  try {
    found = await input.load();
  } catch {
    // Offline, a revoked session or an API error: the last list, if recent.
    return hit && now - hit.at < STALE_MS ? hit.names : [];
  }
  await writeCache(CACHE_FILE, { ...cache, [key]: { at: now, names: found } });
  return found;
};

/** A resource kind's names in one project, under `<scope>:<kind>`. */
export const resourceNames = (input: {
  /** The Space API, made only when the cache misses. */
  connect: () => Promise<Space>;
  kind: ResourceKind;
  scope: string;
  now?: number;
}): Promise<string[]> =>
  cachedNames({
    key: `${input.scope}:${input.kind}`,
    load: async () => load(await input.connect(), input.kind),
    now: input.now,
  });

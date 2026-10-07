// Resource names for tab completion, from the Space API. A Tab press asks
// again within seconds, so nipa keeps each list for a minute.

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

export const resourceNames = async (input: {
  /** The Space API, made only when the cache misses. */
  connect: () => Promise<Space>;
  kind: ResourceKind;
  scope: string;
  now?: number;
}): Promise<string[]> => {
  const now = input.now ?? Date.now();
  const key = `${input.scope}:${input.kind}`;
  const cache = (await readCache(CACHE_FILE, CacheSchema)) ?? {};
  const hit = cache[key];
  if (hit && now - hit.at < FRESH_MS) {
    return hit.names;
  }
  const found = await load(await input.connect(), input.kind);
  await writeCache(CACHE_FILE, { ...cache, [key]: { at: now, names: found } });
  return found;
};

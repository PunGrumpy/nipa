// Resource names for tab completion, from the Space API. A Tab press asks
// again within seconds, so nipa keeps each list for a minute.

import { z } from "zod";

import type { Space } from "./api";
import { listServers } from "./compute";
import type { ResourceKind } from "./openstack";
import { readCache, writeCache } from "./store";

const CACHE_FILE = "names.json";
const FRESH_MS = 60_000;

const NamedSchema = z.object({ name: z.string() });

const MachineTypesSchema = z.object({ machine_types: z.array(NamedSchema) });
const NetworksSchema = z.object({ networks: z.array(NamedSchema) });
// ?table=owned_image answers with owned_images, not images.
const OwnedImagesSchema = z.object({ owned_images: z.array(NamedSchema) });
// The portal groups public images by OS, such as Ubuntu with each release.
const PublicImagesSchema = z.object({
  public_images: z.array(z.object({ images: z.array(NamedSchema) })),
});

const names = (items: readonly { name: string }[]): string[] =>
  items.map((item) => item.name);

const load = async (space: Space, kind: ResourceKind): Promise<string[]> => {
  switch (kind) {
    case "servers": {
      return names(await listServers(space));
    }
    case "flavors": {
      const body = await space.get("/v4/machine_types", MachineTypesSchema);
      return names(body.machine_types);
    }
    case "networks": {
      const body = await space.get("/v4/networks", NetworksSchema);
      return names(body.networks);
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

/** The project's names of `kind`, from the cache when it's under a minute old. */
export const resourceNames = async (input: {
  /** The Space API, made only when the cache misses. */
  connect: () => Promise<Space>;
  kind: ResourceKind;
  /** The profile and project, so another project never gets these names. */
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

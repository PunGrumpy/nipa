// Each resource's pages in the Space portal, from the portal's own router:
// a list page, and a page for one resource. The volume page that the router
// has is never linked to, so a volume opens the volume list filtered to it.

import type { Space } from "../../util/api";
import {
  DATABASES,
  findResource,
  LOAD_BALANCERS,
  NETWORKS,
  SECURITY_GROUPS,
  SERVERS,
  VOLUMES,
} from "../../util/find";
import type { Findable } from "../../util/find";
import type { Resource } from "./command";

export interface Found {
  readonly name: string;
  readonly path: string;
}

interface PortalPages {
  readonly list: string;
  readonly find: (input: {
    space: Space;
    projectName: string;
    ref: string;
  }) => Promise<Found>;
}

const pages = <T extends { id: string; name: string }>(
  list: string,
  kind: Findable<T>,
  detail: (item: T) => string
): PortalPages => ({
  find: async (input) => {
    const item = await findResource({ ...input, kind });
    return { name: item.name || item.id, path: detail(item) };
  },
  list,
});

export const PAGES: Record<Resource, PortalPages> = {
  db: pages(
    "/sql_databases",
    DATABASES,
    (db) => `/sql_databases/${db.id}/overview`
  ),
  lb: pages(
    "/load_balancers",
    LOAD_BALANCERS,
    (lb) => `/load_balancers/${lb.id}/details`
  ),
  network: pages("/networks", NETWORKS, (network) => `/networks/${network.id}`),
  server: pages(
    "/compute_instances",
    SERVERS,
    (server) => `/compute_instances/${server.id}/overview`
  ),
  sg: pages(
    "/security_group",
    SECURITY_GROUPS,
    (group) => `/security_group/${group.id}`
  ),
  volume: pages(
    "/volumes",
    VOLUMES,
    (volume) =>
      `/volumes?search=${encodeURIComponent(volume.name || volume.id)}`
  ),
};

/** The portal's project dashboard. */
export const HOME = "/project";

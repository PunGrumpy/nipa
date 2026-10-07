// Each resource's pages in the Space portal, from the portal's own router:
// a list page, and a page for one resource. The volume page that the router
// has is never linked to, so a volume opens the volume list filtered to it.

import type { Space } from "../../util/api";
import { listDatabases } from "../../util/database";
import { findResource, SERVERS } from "../../util/find";
import type { Findable } from "../../util/find";
import { listLoadBalancers } from "../../util/load-balancer";
import { listNetworks } from "../../util/network";
import { listSecurityGroups } from "../../util/security-group";
import { listVolumes } from "../../util/volume";
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
    {
      list: listDatabases,
      lsCommand: "nipa db ls",
      noun: "database",
      plural: "databases",
    },
    (db) => `/sql_databases/${db.id}/overview`
  ),
  lb: pages(
    "/load_balancers",
    {
      list: listLoadBalancers,
      lsCommand: "nipa lb ls",
      noun: "load balancer",
      plural: "load balancers",
    },
    (lb) => `/load_balancers/${lb.id}/details`
  ),
  network: pages(
    "/networks",
    {
      list: listNetworks,
      lsCommand: "nipa network ls",
      noun: "network",
      plural: "networks",
    },
    (network) => `/networks/${network.id}`
  ),
  server: pages(
    "/compute_instances",
    SERVERS,
    (server) => `/compute_instances/${server.id}/overview`
  ),
  sg: pages(
    "/security_group",
    {
      list: listSecurityGroups,
      lsCommand: "nipa sg ls",
      noun: "security group",
      plural: "security groups",
    },
    (group) => `/security_group/${group.id}`
  ),
  volume: pages(
    "/volumes",
    {
      list: listVolumes,
      lsCommand: "nipa volume ls",
      noun: "volume",
      plural: "volumes",
    },
    (volume) =>
      `/volumes?search=${encodeURIComponent(volume.name || volume.id)}`
  ),
};

/** The portal's project dashboard. */
export const HOME = "/project";

import { z } from "zod";

import type { Service } from "./api";

// 2.47 adds the flavor's name to each server. From 2.69, a server in a cell
// that is down comes back with most of its fields missing.
const HEADERS = { "OpenStack-API-Version": "compute 2.47" };

const AddressSchema = z.object({
  "OS-EXT-IPS:type": z.string().optional(),
  addr: z.string(),
  version: z.number(),
});

const ServerSchema = z.object({
  addresses: z.record(z.string(), z.array(AddressSchema)),
  created: z.string(),
  flavor: z.object({ original_name: z.string() }),
  id: z.string(),
  name: z.string(),
  status: z.string(),
});

const LinkSchema = z.object({ href: z.string(), rel: z.string() });

type Link = z.infer<typeof LinkSchema>;

const ServersSchema = z.object({
  servers: z.array(ServerSchema),
  servers_links: z.array(LinkSchema).optional(),
});

export interface Address {
  network: string;
  address: string;
  version: number;
  /** "fixed", or "floating" for a floating IP. */
  type: string;
}

export interface Server {
  id: string;
  name: string;
  /** Nova's status, such as ACTIVE or SHUTOFF. */
  status: string;
  flavor: string;
  addresses: Address[];
  createdAt: string;
}

const toServer = (server: z.infer<typeof ServerSchema>): Server => ({
  addresses: Object.entries(server.addresses).flatMap(([network, list]) =>
    list.map((a) => ({
      address: a.addr,
      network,
      type: a["OS-EXT-IPS:type"] ?? "fixed",
      version: a.version,
    }))
  ),
  createdAt: server.created,
  flavor: server.flavor.original_name,
  id: server.id,
  name: server.name,
  status: server.status,
});

// The next link can name an internal host, so nipa keeps only its marker.
const nextMarker = (links: readonly Link[] = []): string | undefined => {
  const next = links.find((link) => link.rel === "next");
  if (!next) {
    return undefined;
  }
  const url = URL.parse(next.href, "http://localhost");
  return url?.searchParams.get("marker") ?? undefined;
};

/** The servers from `marker` on: this page, then the pages after it. */
const listFrom = async (input: {
  compute: Service;
  marker?: string;
}): Promise<Server[]> => {
  const { compute, marker } = input;
  const query =
    marker === undefined ? "" : `?marker=${encodeURIComponent(marker)}`;
  const page = await compute.get(
    `/servers/detail${query}`,
    ServersSchema,
    HEADERS
  );
  const servers = page.servers.map(toServer);
  const next = nextMarker(page.servers_links);
  // A next link that repeats the marker would ask for the same page forever.
  if (next === undefined || next === marker || servers.length === 0) {
    return servers;
  }
  return [...servers, ...(await listFrom({ compute, marker: next }))];
};

/** Every server in the project, newest first, across all pages. */
export const listServers = (compute: Service): Promise<Server[]> =>
  listFrom({ compute });

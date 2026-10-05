import { z } from "zod";

import type { Space } from "./api";

const IpSchema = z.object({ address: z.string() });

// v3 names each server's flavor, which v4 leaves out. It sends every server
// in one page, newest first.
const ServerSchema = z.object({
  created: z.string(),
  external_ips: z.array(IpSchema),
  flavor: z.object({ name: z.string() }),
  id: z.string(),
  internal_ips: z.array(IpSchema),
  name: z.string(),
  status: z.string(),
});

const ServersSchema = z.object({ instances: z.array(ServerSchema) });

export interface Address {
  address: string;
  version: 4 | 6;
  /** "fixed" for an internal IP, or "floating" for an external one. */
  type: "fixed" | "floating";
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

const toAddress = (
  ip: z.infer<typeof IpSchema>,
  type: Address["type"]
): Address => ({
  address: ip.address,
  type,
  version: ip.address.includes(":") ? 6 : 4,
});

const toServer = (server: z.infer<typeof ServerSchema>): Server => ({
  addresses: [
    ...server.internal_ips.map((ip) => toAddress(ip, "fixed")),
    ...server.external_ips.map((ip) => toAddress(ip, "floating")),
  ],
  createdAt: server.created,
  flavor: server.flavor.name,
  id: server.id,
  name: server.name,
  status: server.status,
});

/** Every server in the project, newest first. */
export const listServers = async (space: Space): Promise<Server[]> => {
  const body = await space.get("/v3/instances", ServersSchema);
  return body.instances.map(toServer);
};

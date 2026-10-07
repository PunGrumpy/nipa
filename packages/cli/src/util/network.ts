import { z } from "zod";

import { utcTime } from "./api";
import type { Space } from "./api";

const NetworkSchema = z.object({
  // Missing or "" when Neutron picks the zone.
  availability_zone: z.string().optional(),
  created_at: z.string(),
  external_network: z.boolean(),
  id: z.string(),
  name: z.string(),
  shared: z.boolean(),
  status: z.string(),
});

const NetworksSchema = z.object({ networks: z.array(NetworkSchema) });

export interface Network {
  id: string;
  name: string;
  /** Neutron's status, such as ACTIVE or DOWN. */
  status: string;
  /** True for a pool of external IPs, false for a VPC network. */
  external: boolean;
  /** True when other projects can use it too. */
  shared: boolean;
  zone: string | null;
  createdAt: string;
}

const toNetwork = (network: z.infer<typeof NetworkSchema>): Network => ({
  createdAt: utcTime(network.created_at),
  external: network.external_network,
  id: network.id,
  name: network.name,
  shared: network.shared,
  status: network.status,
  zone: network.availability_zone || null,
});

/** Every network the project can use, its own and shared ones, newest first. */
export const listNetworks = async (space: Space): Promise<Network[]> => {
  const body = await space.get("/v4/networks", NetworksSchema);
  return body.networks
    .map(toNetwork)
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
};

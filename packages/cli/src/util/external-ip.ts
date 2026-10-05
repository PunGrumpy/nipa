import { z } from "zod";

import type { Space } from "./api";

const ExternalIpSchema = z.object({
  availability_zone: z.string(),
  external_ip_address: z.string(),
  id: z.string(),
  internal_ip_address: z.string().nullable(),
  name: z.string(),
  status: z.string(),
});

const ExternalIpsSchema = z.object({ external_ips: z.array(ExternalIpSchema) });

export interface ExternalIp {
  id: string;
  address: string;
  name: string;
  /** ACTIVE when it forwards traffic, DOWN when it doesn't. */
  status: string;
  /** The internal IP it forwards to, or null when it isn't attached. */
  internalAddress: string | null;
  zone: string;
}

const toExternalIp = (ip: z.infer<typeof ExternalIpSchema>): ExternalIp => ({
  address: ip.external_ip_address,
  id: ip.id,
  internalAddress: ip.internal_ip_address,
  name: ip.name,
  status: ip.status,
  zone: ip.availability_zone,
});

/** Every external IP in the project, in the Space API's order. */
export const listExternalIps = async (space: Space): Promise<ExternalIp[]> => {
  const body = await space.get("/v4/external_ips", ExternalIpsSchema);
  return body.external_ips.map(toExternalIp);
};

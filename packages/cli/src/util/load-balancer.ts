import { z } from "zod";

import type { Space } from "./api";

const LoadBalancerSchema = z.object({
  created_at: z.string(),
  id: z.string(),
  // nipa counts them, so their shape doesn't matter.
  listeners: z.array(z.unknown()),
  name: z.string(),
  operating_status: z.string(),
  provisioning_status: z.string(),
  vip_address: z.string(),
});

const LoadBalancersSchema = z.object({
  loadbalancers: z.array(LoadBalancerSchema),
});

export interface LoadBalancer {
  id: string;
  name: string;
  /** Octavia's provisioning status, such as ACTIVE or PENDING_CREATE. */
  status: string;
  /** Octavia's operating status, such as ONLINE or OFFLINE. */
  health: string;
  /** The virtual IP that takes the traffic. */
  address: string;
  listeners: number;
  createdAt: string;
}

const toLoadBalancer = (
  lb: z.infer<typeof LoadBalancerSchema>
): LoadBalancer => ({
  address: lb.vip_address,
  createdAt: lb.created_at,
  health: lb.operating_status,
  id: lb.id,
  listeners: lb.listeners.length,
  name: lb.name,
  status: lb.provisioning_status,
});

/** Every load balancer in the project, newest first. */
export const listLoadBalancers = async (
  space: Space
): Promise<LoadBalancer[]> => {
  const body = await space.get("/v4/loadbalancers", LoadBalancersSchema);
  return body.loadbalancers
    .map(toLoadBalancer)
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
};

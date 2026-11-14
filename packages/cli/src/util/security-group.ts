import { z } from "zod";

import { utcTime } from "./api";
import type { Space } from "./api";
import type { Server } from "./compute";
import type { Port } from "./network";

const RuleSchema = z.object({
  direction: z.string(),
  ethertype: z.string(),
  id: z.string(),
  port_range_max: z.number().nullable(),
  port_range_min: z.number().nullable(),
  protocol: z.string().nullable(),
  remote_group_id: z.string().nullable(),
  remote_ip_prefix: z.string().nullable(),
});

const SecurityGroupSchema = z.object({
  created_at: z.string(),
  description: z.string().nullable(),
  id: z.string(),
  name: z.string(),
  security_group_rules: z.array(RuleSchema),
});

const SecurityGroupsSchema = z.object({
  security_groups: z.array(SecurityGroupSchema),
});

export interface SecurityGroupRule {
  id: string;
  /** ingress for traffic in, egress for traffic out. */
  direction: string;
  /** IPv4 or IPv6. */
  ethertype: string;
  /** The protocol, such as tcp, or any. */
  protocol: string | null;
  /** The ports, or null for every port. */
  portMin: number | null;
  portMax: number | null;
  /** Where the traffic may come from or go to: a CIDR, or a security group. */
  remoteIpPrefix: string | null;
  remoteGroupId: string | null;
}

export interface SecurityGroup {
  id: string;
  name: string;
  description: string | null;
  rules: SecurityGroupRule[];
  createdAt: string;
}

const toRule = (rule: z.infer<typeof RuleSchema>): SecurityGroupRule => ({
  direction: rule.direction,
  ethertype: rule.ethertype,
  id: rule.id,
  portMax: rule.port_range_max,
  portMin: rule.port_range_min,
  protocol: rule.protocol,
  remoteGroupId: rule.remote_group_id,
  remoteIpPrefix: rule.remote_ip_prefix,
});

const toSecurityGroup = (
  group: z.infer<typeof SecurityGroupSchema>
): SecurityGroup => ({
  createdAt: utcTime(group.created_at),
  description: group.description || null,
  id: group.id,
  name: group.name,
  rules: group.security_group_rules.map(toRule),
});

/** Every security group in the project, newest first. */
export const listSecurityGroups = async (
  space: Space
): Promise<SecurityGroup[]> => {
  const body = await space.get("/v4/security_groups", SecurityGroupsSchema);
  return body.security_groups
    .map(toSecurityGroup)
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
};

export interface Member {
  id: string;
  name: string;
  /** The server's addresses on the ports that carry the group. */
  addresses: string[];
}

// A server's security groups belong to its ports, which name them by ID.
// The server list names them, and two groups can share a name.
export const membersOf = (
  groupId: string,
  ports: readonly Port[],
  servers: readonly Server[]
): Member[] =>
  servers.flatMap((server) => {
    const own = ports.filter(
      (port) =>
        port.deviceId === server.id && port.securityGroupIds.includes(groupId)
    );
    return own.length > 0
      ? [
          {
            addresses: own.flatMap((port) => port.addresses),
            id: server.id,
            name: server.name,
          },
        ]
      : [];
  });

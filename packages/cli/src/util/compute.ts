import { setTimeout as delay } from "node:timers/promises";

import { z } from "zod";

import type { Space } from "./api";

const IpSchema = z.object({ address: z.string() });

// Magnum tags each server it makes for a cluster with the cluster and the
// node's role. The portal marks those servers the same way. kube_version
// comes from the node's image.
const MetadataSchema = z.object({
  kube_version: z.string().optional(),
  magnum_cluster_id: z.string().optional(),
  magnum_role: z.string().optional(),
});

const VolumeSchema = z.object({
  attached_as: z.string().nullish(),
  id: z.string(),
  name: z.string().nullish(),
  size: z.number(),
  volume_type: z.string().nullish(),
});

// v3 names each server's flavor and volumes, which v4 leaves out. It sends
// every server in one page, newest first.
const ServerSchema = z.object({
  "OS-EXT-AZ:availability_zone": z.string().nullish(),
  created: z.string(),
  external_ips: z.array(IpSchema),
  flavor: z.object({
    name: z.string(),
    ram: z.number().optional(),
    vcpus: z.number().optional(),
  }),
  id: z.string(),
  internal_ips: z.array(IpSchema),
  metadata: MetadataSchema.optional(),
  name: z.string(),
  security_groups: z.array(z.string()).optional(),
  status: z.string(),
  volumes: z.array(VolumeSchema).optional(),
});

const ServersSchema = z.object({ instances: z.array(ServerSchema) });

export interface Address {
  address: string;
  version: 4 | 6;
  /** "fixed" for an internal IP, or "floating" for an external one. */
  type: "fixed" | "floating";
}

export interface KubernetesNode {
  /** The ID of the Magnum cluster the server belongs to. */
  clusterId: string;
  /** Magnum's role for the node, such as master or worker. */
  role: string | null;
  /** The Kubernetes version of the node's image, such as 1.34.9. */
  version: string | null;
}

export interface Volume {
  id: string;
  name: string | null;
  sizeGb: number;
  type: string | null;
  attachedAs: string | null;
}

export interface Server {
  id: string;
  name: string;
  /** Nova's status, such as ACTIVE or SHUTOFF. */
  status: string;
  flavor: string;
  vcpus: number | null;
  ramMb: number | null;
  zone: string | null;
  addresses: Address[];
  volumes: Volume[];
  securityGroups: string[];
  /** The Kubernetes cluster that made the server, or null for one people made. */
  kubernetes: KubernetesNode | null;
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

const toKubernetesNode = (
  metadata: z.infer<typeof MetadataSchema> = {}
): KubernetesNode | null =>
  metadata.magnum_cluster_id === undefined
    ? null
    : {
        clusterId: metadata.magnum_cluster_id,
        role: metadata.magnum_role ?? null,
        version: metadata.kube_version ?? null,
      };

const toVolume = (volume: z.infer<typeof VolumeSchema>): Volume => ({
  attachedAs: volume.attached_as ?? null,
  id: volume.id,
  name: volume.name ?? null,
  sizeGb: volume.size,
  type: volume.volume_type ?? null,
});

const toServer = (server: z.infer<typeof ServerSchema>): Server => ({
  addresses: [
    ...server.internal_ips.map((ip) => toAddress(ip, "fixed")),
    ...server.external_ips.map((ip) => toAddress(ip, "floating")),
  ],
  createdAt: server.created,
  flavor: server.flavor.name,
  id: server.id,
  kubernetes: toKubernetesNode(server.metadata),
  name: server.name,
  ramMb: server.flavor.ram ?? null,
  securityGroups: server.security_groups ?? [],
  status: server.status,
  vcpus: server.flavor.vcpus ?? null,
  volumes: (server.volumes ?? []).map(toVolume),
  zone: server["OS-EXT-AZ:availability_zone"] ?? null,
});

/** Every server in the project, newest first. */
export const listServers = async (space: Space): Promise<Server[]> => {
  const body = await space.get("/v3/instances", ServersSchema);
  return body.instances.map(toServer);
};

/** The servers whose ID is `ref`, or else whose name is `ref`. */
export const matchServers = (
  servers: readonly Server[],
  ref: string
): Server[] => {
  const byId = servers.filter((server) => server.id === ref);
  return byId.length > 0
    ? byId
    : servers.filter((server) => server.name === ref);
};

// v4 has Nova's task state, which v3 leaves out. A server is busy until
// it's null, such as "powering-off" during a stop.
const StateSchema = z.object({
  instance: z.object({ status: z.string(), task_state: z.string().nullable() }),
});

export interface ServerState {
  status: string;
  taskState: string | null;
}

const getServerState = async (
  space: Space,
  id: string
): Promise<ServerState> => {
  const { instance } = await space.get(`/v4/instances/${id}`, StateSchema);
  return { status: instance.status, taskState: instance.task_state };
};

export type PowerAction = "start" | "stop" | "restart";

export const powerServer = (
  space: Space,
  id: string,
  action: PowerAction
): Promise<void> => space.post(`/v4/instances/${id}/action/${action}`);

export type WaitOutcome =
  | { kind: "done" }
  | { kind: "error" }
  | { kind: "timeout"; state: ServerState };

// Checks at once: Nova sets the task before it answers the action.
export const waitForServer = (input: {
  space: Space;
  id: string;
  status: string;
  timeoutMs: number;
  intervalMs: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<WaitOutcome> => {
  const sleep = input.sleep ?? delay;
  const now = input.now ?? Date.now;
  const deadline = now() + input.timeoutMs;
  const poll = async (): Promise<WaitOutcome> => {
    const state = await getServerState(input.space, input.id);
    if (state.status === "ERROR") {
      return { kind: "error" };
    }
    if (state.status === input.status && state.taskState === null) {
      return { kind: "done" };
    }
    if (now() >= deadline) {
      return { kind: "timeout", state };
    }
    await sleep(input.intervalMs);
    return poll();
  };
  return poll();
};

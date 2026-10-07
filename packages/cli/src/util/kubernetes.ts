// Nipa Cloud's Space API has no Kubernetes endpoint, and production's
// catalog has no Magnum, so nipa finds each cluster through the servers
// Magnum made for it. A cluster without servers doesn't show.

import type { Space } from "./api";
import { listServers } from "./compute";
import type { Server } from "./compute";

export interface ClusterNode {
  id: string;
  name: string;
  /** Magnum's role for the node, such as master or worker. */
  role: string | null;
  /** Nova's status, such as ACTIVE or ERROR. */
  status: string;
}

export interface KubernetesCluster {
  /** The Magnum cluster's ID. */
  id: string;
  /** The Kubernetes version of its nodes' images, such as 1.34.9. */
  version: string | null;
  /** Masters first, then by name. */
  nodes: ClusterNode[];
  /** When its oldest node was made. */
  createdAt: string;
}

const byRoleThenName = (a: ClusterNode, b: ClusterNode): number => {
  const master = Number(b.role === "master") - Number(a.role === "master");
  return master === 0 ? a.name.localeCompare(b.name) : master;
};

/** The clusters the servers belong to, newest first. */
const groupClusters = (servers: readonly Server[]): KubernetesCluster[] => {
  const clusters = new Map<string, KubernetesCluster>();
  for (const server of servers) {
    if (!server.kubernetes) {
      continue;
    }
    const { clusterId, role, version } = server.kubernetes;
    const cluster = clusters.get(clusterId) ?? {
      createdAt: server.createdAt,
      id: clusterId,
      nodes: [],
      version: null,
    };
    cluster.nodes.push({
      id: server.id,
      name: server.name,
      role,
      status: server.status,
    });
    cluster.version ??= version;
    if (Date.parse(server.createdAt) < Date.parse(cluster.createdAt)) {
      cluster.createdAt = server.createdAt;
    }
    clusters.set(clusterId, cluster);
  }
  return [...clusters.values()]
    .map((cluster) => ({
      ...cluster,
      nodes: cluster.nodes.toSorted(byRoleThenName),
    }))
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
};

/** Every Kubernetes cluster with a server in the project, newest first. */
export const listClusters = async (
  space: Space
): Promise<KubernetesCluster[]> => groupClusters(await listServers(space));

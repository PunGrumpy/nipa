import { z } from "zod";

import type { Space } from "./api";

const PrimarySchema = z.object({
  datastore_type: z.string(),
  datastore_version: z.string(),
  external_ip_address: z.string().nullish(),
  instance_status: z.string(),
  ip_address: z.string(),
  machine_type: z.object({ name: z.string() }),
  operating_status: z.string(),
  volume_size: z.number(),
});

const ClusterSchema = z.object({
  created_at: z.string(),
  id: z.string(),
  name: z.string(),
  primary: PrimarySchema.nullish(),
});

const ClustersSchema = z.object({ database_clusters: z.array(ClusterSchema) });

export interface DatabaseInstance {
  /** The datastore, such as mysql or postgresql. */
  engine: string;
  version: string;
  /** Trove's status, such as ACTIVE or BUILD. */
  status: string;
  /** HEALTHY when the database answers. */
  health: string;
  flavor: string;
  storageGb: number;
  address: string;
  externalAddress: string | null;
}

export interface Database {
  id: string;
  name: string;
  /** The instance that takes writes. A new cluster has none yet. */
  primary: DatabaseInstance | null;
  createdAt: string;
}

const toInstance = (
  primary: z.infer<typeof PrimarySchema>
): DatabaseInstance => ({
  address: primary.ip_address,
  engine: primary.datastore_type,
  externalAddress: primary.external_ip_address ?? null,
  flavor: primary.machine_type.name,
  health: primary.operating_status,
  status: primary.instance_status,
  storageGb: primary.volume_size,
  version: primary.datastore_version,
});

const toDatabase = (cluster: z.infer<typeof ClusterSchema>): Database => ({
  createdAt: cluster.created_at,
  id: cluster.id,
  name: cluster.name,
  primary: cluster.primary ? toInstance(cluster.primary) : null,
});

/** Every database cluster in the project, newest first. */
export const listDatabases = async (space: Space): Promise<Database[]> => {
  const body = await space.get(
    "/v4/database/clusters?include_primary=true&include_machine_type=true",
    ClustersSchema
  );
  return body.database_clusters
    .map(toDatabase)
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
};

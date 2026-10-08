import { z } from "zod";

import { utcTime } from "./api";
import type { Space } from "./api";

const PrimarySchema = z.object({
  allowed_cidrs: z.array(z.string()).nullish(),
  availability_zone: z.string().nullish(),
  datastore_type: z.string(),
  datastore_version: z.string(),
  external_ip_address: z.string().nullish(),
  id: z.string(),
  instance_status: z.string(),
  ip_address: z.string(),
  machine_type: z.object({
    name: z.string(),
    ram: z.number().nullish(),
    vcpus: z.number().nullish(),
  }),
  operating_status: z.string(),
  service_status_updated: z.string().nullish(),
  volume_size: z.number(),
});

const ClusterSchema = z.object({
  created_at: z.string(),
  id: z.string(),
  name: z.string(),
  primary: PrimarySchema.nullish(),
});

const ClustersSchema = z.object({ database_clusters: z.array(ClusterSchema) });

// /v4/databases lists the instances without their machine type. Staging has
// never shown a replica, so this takes what a building one may lack.
const InstancesSchema = z.object({
  database_instances: z.array(
    z.object({
      database_cluster_id: z.string().nullish(),
      id: z.string(),
      instance_status: z.string(),
      ip_address: z.string().nullish(),
      name: z.string(),
      operating_status: z.string().nullish(),
    })
  ),
});

// Trove keeps a log's state in status, and the bytes it sent to object
// storage in published.
const LogsSchema = z.record(
  z.string(),
  z.object({
    name: z.string(),
    published: z.number().nullish(),
    status: z.string(),
  })
);

// Trove sends backup times in UTC without a zone, and size in GB.
const BackupsSchema = z.object({
  database_backups: z.array(
    z.object({
      created_at: z.string(),
      database_instance_id: z.string(),
      id: z.string(),
      name: z.string(),
      size: z.number().nullish(),
      status: z.string(),
    })
  ),
});

export interface DatabaseInstance {
  id: string;
  /** The datastore, such as mysql or postgresql. */
  engine: string;
  version: string;
  /** Trove's status, such as ACTIVE or BUILD. */
  status: string;
  /** HEALTHY when the database answers. */
  health: string;
  /** When Trove last checked health. */
  healthCheckedAt: string | null;
  flavor: string;
  vcpus: number | null;
  ramMb: number | null;
  storageGb: number;
  zone: string | null;
  address: string;
  externalAddress: string | null;
  /** The engine's default port. The Space API doesn't send one. */
  port: number | null;
  /** The ranges allowed to connect. Empty when none are set. */
  allowedCidrs: string[];
}

export interface Database {
  id: string;
  name: string;
  /** The instance that takes writes. A new cluster has none yet. */
  primary: DatabaseInstance | null;
  createdAt: string;
}

export interface DatabaseReplica {
  id: string;
  name: string;
  status: string;
  /** HEALTHY when the replica answers. UNKNOWN until Trove checks it. */
  health: string;
  /** None while Trove is still building the replica. */
  address: string | null;
}

export interface DatabaseLog {
  /** Trove's name for the log, such as general or slow_query. */
  name: string;
  /** Trove's status, such as Disabled, Enabled or Published. */
  status: string;
  enabled: boolean;
  publishedBytes: number;
}

export interface DatabaseBackup {
  id: string;
  name: string;
  /** Trove's status, such as COMPLETED, BUILDING or FAILED. */
  status: string;
  sizeGb: number | null;
  createdAt: string;
}

/**
 * One database with what `nipa db inspect` shows: replicas, logs and backups.
 * A part is `null` when the Space API didn't answer for it, so one failing
 * endpoint doesn't hide the rest.
 */
export interface DatabaseDetail extends Database {
  replicas: DatabaseReplica[] | null;
  logs: DatabaseLog[] | null;
  /** The primary's backups, newest first. */
  backups: DatabaseBackup[] | null;
}

const DEFAULT_PORTS = new Map([
  ["mariadb", 3306],
  ["mongodb", 27_017],
  ["mysql", 3306],
  ["percona", 3306],
  ["postgresql", 5432],
  ["redis", 6379],
]);

const toInstance = (
  primary: z.infer<typeof PrimarySchema>
): DatabaseInstance => ({
  address: primary.ip_address,
  allowedCidrs: primary.allowed_cidrs ?? [],
  engine: primary.datastore_type,
  // The Space API sends "" for a database without an external IP.
  externalAddress: primary.external_ip_address || null,
  flavor: primary.machine_type.name,
  health: primary.operating_status,
  healthCheckedAt: primary.service_status_updated ?? null,
  id: primary.id,
  port: DEFAULT_PORTS.get(primary.datastore_type.toLowerCase()) ?? null,
  ramMb: primary.machine_type.ram ?? null,
  status: primary.instance_status,
  storageGb: primary.volume_size,
  vcpus: primary.machine_type.vcpus ?? null,
  version: primary.datastore_version,
  zone: primary.availability_zone || null,
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

// The cluster's other instances replicate its primary.
const listReplicas = async (
  space: Space,
  database: Database,
  primaryId: string
): Promise<DatabaseReplica[]> => {
  const body = await space.get(
    `/v4/databases?database_cluster_id=${encodeURIComponent(database.id)}`,
    InstancesSchema
  );
  return body.database_instances
    .filter(
      (instance) =>
        instance.database_cluster_id === database.id &&
        instance.id !== primaryId
    )
    .map((instance) => ({
      address: instance.ip_address || null,
      health: instance.operating_status ?? "UNKNOWN",
      id: instance.id,
      name: instance.name,
      status: instance.instance_status,
    }));
};

const OFF_LOG_STATUSES = new Set(["DISABLED", "UNAVAILABLE"]);

const listLogs = async (
  space: Space,
  primaryId: string
): Promise<DatabaseLog[]> => {
  const body = await space.get(
    `/v4/database/${encodeURIComponent(primaryId)}/logs`,
    LogsSchema
  );
  return Object.values(body).map((log) => ({
    enabled: !OFF_LOG_STATUSES.has(log.status.toUpperCase()),
    name: log.name,
    publishedBytes: log.published ?? 0,
    status: log.status,
  }));
};

const listBackups = async (
  space: Space,
  primaryId: string
): Promise<DatabaseBackup[]> => {
  const body = await space.get(
    `/v4/database/backups?database_instance_id=${encodeURIComponent(primaryId)}`,
    BackupsSchema
  );
  return body.database_backups
    .filter((backup) => backup.database_instance_id === primaryId)
    .map((backup) => ({
      createdAt: utcTime(backup.created_at),
      id: backup.id,
      name: backup.name,
      sizeGb: backup.size ?? null,
      status: backup.status,
    }))
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
};

// The value, or null when the request failed.
const settled = <T>(result: PromiseSettledResult<T>): T | null =>
  result.status === "fulfilled" ? result.value : null;

/**
 * `database` with its replicas, logs and backups, which need a primary. Each
 * part comes from its own endpoint, and one that fails leaves its part `null`
 * instead of failing the whole.
 */
export const inspectDatabase = async (
  space: Space,
  database: Database
): Promise<DatabaseDetail> => {
  const { primary } = database;
  if (!primary) {
    return { ...database, backups: [], logs: [], replicas: [] };
  }
  const [replicas, logs, backups] = await Promise.allSettled([
    listReplicas(space, database, primary.id),
    listLogs(space, primary.id),
    listBackups(space, primary.id),
  ]);
  return {
    ...database,
    backups: settled(backups),
    logs: settled(logs),
    replicas: settled(replicas),
  };
};

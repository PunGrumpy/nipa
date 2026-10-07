import { describe, expect, test } from "bun:test";

import { databaseProblems } from "../../../../src/commands/db/health";
import type {
  DatabaseBackup,
  DatabaseDetail,
  DatabaseInstance,
} from "../../../../src/util/database";

const PRIMARY: DatabaseInstance = {
  address: "192.0.2.20",
  allowedCidrs: [],
  engine: "mysql",
  externalAddress: null,
  flavor: "dsa.large.v1",
  health: "HEALTHY",
  healthCheckedAt: null,
  id: "p1",
  port: 3306,
  ramMb: 4096,
  status: "ACTIVE",
  storageGb: 10,
  vcpus: 2,
  version: "8.0.34",
  zone: null,
};

const backup = (name: string, status: string): DatabaseBackup => ({
  createdAt: "2026-10-06T09:16:23Z",
  id: name,
  name,
  sizeGb: 0.19,
  status,
});

const database = (detail: Partial<DatabaseDetail>): DatabaseDetail => ({
  backups: [],
  createdAt: "2026-10-05T10:00:29.000Z",
  id: "c1",
  logs: [],
  name: "orders",
  primary: PRIMARY,
  replicas: [],
  ...detail,
});

describe("databaseProblems", () => {
  test("a running, healthy database has none", () => {
    expect(
      databaseProblems(database({ backups: [backup("b1", "COMPLETED")] }))
    ).toEqual([]);
  });

  test("names the primary's status and health", () => {
    const primary = { ...PRIMARY, health: "UNKNOWN", status: "BUILD" };
    expect(databaseProblems(database({ primary }))).toEqual([
      "the primary's status is Build",
      "the primary's health is Unknown",
    ]);
  });

  test("names a replica that isn't running or healthy", () => {
    const replica = { address: "192.0.2.22", id: "r", name: "orders-r1" };
    expect(
      databaseProblems(
        database({
          replicas: [
            { ...replica, health: "HEALTHY", status: "ERROR" },
            {
              ...replica,
              health: "DEGRADED",
              name: "orders-r2",
              status: "ACTIVE",
            },
          ],
        })
      )
    ).toEqual([
      "orders-r1's status is Error",
      "orders-r2's health is Degraded",
    ]);
  });

  test("flags only the latest backup's failure", () => {
    expect(
      databaseProblems(
        database({
          backups: [backup("b2", "FAILED"), backup("b1", "COMPLETED")],
        })
      )
    ).toEqual(["the latest backup, b2, failed"]);
    expect(
      databaseProblems(
        database({
          backups: [backup("b2", "COMPLETED"), backup("b1", "FAILED")],
        })
      )
    ).toEqual([]);
  });

  test("a cluster without a primary", () => {
    expect(databaseProblems(database({ primary: null }))).toEqual([
      "the cluster has no primary yet",
    ]);
  });
});

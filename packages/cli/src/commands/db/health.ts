import type { DatabaseDetail } from "../../util/database";
import { isFailing, statusLabel } from "../../util/status";

/** Where a problem is. `--json` prints these words, so they only ever grow. */
const PARTS = ["cluster", "primary", "replica", "backup"] as const;

/**
 * One thing that isn't healthy about a database, for `--json`. `part` says
 * where, `name` which replica or backup, and `value` the status or health
 * that's wrong. A cluster without a primary has `field` "primary" and no value.
 */
export interface DatabaseProblem {
  part: (typeof PARTS)[number];
  /** The replica's or backup's name. `null` for the cluster or primary. */
  name: string | null;
  field: "primary" | "status" | "health";
  value: string | null;
}

const isRunning = (status: string): boolean =>
  status.toUpperCase() === "ACTIVE";
const isAnswering = (health: string): boolean =>
  health.toUpperCase() === "HEALTHY";

/** What isn't healthy about `database`. Empty when it's healthy. */
export const databaseProblems = (
  database: DatabaseDetail
): DatabaseProblem[] => {
  const { primary } = database;
  if (!primary) {
    return [{ field: "primary", name: null, part: "cluster", value: null }];
  }
  const problems: DatabaseProblem[] = [];
  if (!isRunning(primary.status)) {
    problems.push({
      field: "status",
      name: null,
      part: "primary",
      value: primary.status,
    });
  }
  if (!isAnswering(primary.health)) {
    problems.push({
      field: "health",
      name: null,
      part: "primary",
      value: primary.health,
    });
  }
  for (const replica of database.replicas ?? []) {
    if (!isRunning(replica.status)) {
      problems.push({
        field: "status",
        name: replica.name,
        part: "replica",
        value: replica.status,
      });
    } else if (!isAnswering(replica.health)) {
      problems.push({
        field: "health",
        name: replica.name,
        part: "replica",
        value: replica.health,
      });
    }
  }
  const [latest] = database.backups ?? [];
  if (latest && isFailing(latest.status)) {
    problems.push({
      field: "status",
      name: latest.name,
      part: "backup",
      value: latest.status,
    });
  }
  return problems;
};

/**
 * `problem` as a fragment for the verdict line, such as "the primary's health
 * is Unknown" or "the latest backup, nightly, failed".
 */
export const describeProblem = (problem: DatabaseProblem): string => {
  if (problem.part === "cluster") {
    return "the cluster has no primary yet";
  }
  if (problem.part === "backup") {
    const label = statusLabel(problem.value ?? "");
    return label === "Failed"
      ? `the latest backup, ${problem.name}, failed`
      : `the latest backup, ${problem.name}, is ${label}`;
  }
  const owner = problem.part === "primary" ? "the primary" : problem.name;
  return `${owner}'s ${problem.field} is ${statusLabel(problem.value ?? "")}`;
};

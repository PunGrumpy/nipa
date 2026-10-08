import type { DatabaseDetail } from "../../util/database";
import { statusLabel } from "../../util/status";

const isRunning = (status: string): boolean =>
  status.toUpperCase() === "ACTIVE";
const isAnswering = (health: string): boolean =>
  health.toUpperCase() === "HEALTHY";

/**
 * What isn't healthy about `database`, as fragments such as "the primary's
 * health is Unknown". Empty when it's healthy.
 */
export const databaseProblems = (database: DatabaseDetail): string[] => {
  const { primary } = database;
  if (!primary) {
    return ["the cluster has no primary yet"];
  }
  const problems: string[] = [];
  if (!isRunning(primary.status)) {
    problems.push(`the primary's status is ${statusLabel(primary.status)}`);
  }
  if (!isAnswering(primary.health)) {
    problems.push(`the primary's health is ${statusLabel(primary.health)}`);
  }
  for (const replica of database.replicas ?? []) {
    if (!isRunning(replica.status)) {
      problems.push(
        `${replica.name}'s status is ${statusLabel(replica.status)}`
      );
    } else if (!isAnswering(replica.health)) {
      problems.push(
        `${replica.name}'s health is ${statusLabel(replica.health)}`
      );
    }
  }
  const [latest] = database.backups ?? [];
  if (latest?.status.toUpperCase().includes("FAIL")) {
    problems.push(`the latest backup, ${latest.name}, failed`);
  }
  return problems;
};

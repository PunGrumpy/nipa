import { handle } from "../../util/command";
import { listSecurityGroups } from "../../util/security-group";
import type { SecurityGroup } from "../../util/security-group";
import {
  bold,
  dim,
  formatAge,
  formatElapsed,
  gray,
  log,
  printTable,
  withSpinner,
} from "../../util/ui";
import { lsSubcommand } from "./command";

const ruleCount = (group: SecurityGroup, direction: string): number =>
  group.rules.filter((rule) => rule.direction === direction).length;

const printSecurityGroups = (
  groups: readonly SecurityGroup[],
  now: number
): void => {
  printTable({
    headings: ["Name", "Inbound", "Outbound", "Age", "Description"],
    rows: groups.map((group) => [
      { text: group.name },
      { text: String(ruleCount(group, "ingress")) },
      { text: String(ruleCount(group, "egress")) },
      { paint: gray, text: formatAge(now - Date.parse(group.createdAt)) },
      { text: group.description ?? "-" },
    ]),
  });
};

export const ls = handle(lsSubcommand, async ({ client, flags }) => {
  const { active, session, space } = await client.cloud();
  const { project } = session;
  const started = performance.now();
  const securityGroups = await withSpinner(
    `Loading the security groups in ${project.name}…`,
    () => listSecurityGroups(space)
  );
  if (flags.json) {
    client.stdout.json({ profile: active.name, project, securityGroups });
    return 0;
  }
  const elapsed = dim(`[${formatElapsed(performance.now() - started)}]`);
  if (securityGroups.length === 0) {
    log(`No security groups in ${bold(project.name)} ${elapsed}`);
    return 0;
  }
  log(`Security groups in ${bold(project.name)} ${elapsed}`);
  printSecurityGroups(securityGroups, Date.now());
  // A pipe gets one ID per line, because two security groups can share a name.
  if (!client.stdout.isTTY) {
    client.stdout.line(securityGroups.map((group) => group.id).join("\n"));
  }
  return 0;
});

import { handle } from "../../util/command";
import { listServers } from "../../util/compute";
import { findResource, SECURITY_GROUPS } from "../../util/find";
import { listPorts } from "../../util/network";
import { listSecurityGroups, membersOf } from "../../util/security-group";
import type { Member, SecurityGroup } from "../../util/security-group";
import {
  compareRules,
  exposureNote,
  isExposed,
  ruleCells,
  toRule,
} from "../../util/security-group-rule";
import {
  bold,
  dim,
  formatAge,
  formatElapsed,
  gray,
  log,
  note,
  printFields,
  printTable,
  withDetail,
  withSpinner,
  yellow,
} from "../../util/ui";
import type { Cell } from "../../util/ui";
import { inspectSubcommand } from "./command";

/** The server's name, then its addresses, or - for a port without one. */
const memberCell = (member: Member): Cell =>
  withDetail(
    member.name,
    ` (${member.addresses.length > 0 ? member.addresses.join(", ") : "-"})`
  );

const DIRECTIONS = [
  {
    direction: "ingress",
    empty: "No inbound rules, so this group lets no traffic in.",
    remote: "Source",
    title: "Inbound rules",
  },
  {
    direction: "egress",
    empty: "No outbound rules, so this group lets no traffic out.",
    remote: "Destination",
    title: "Outbound rules",
  },
] as const;

const printRules = (
  group: SecurityGroup,
  groupNames: ReadonlyMap<string, string>
): void => {
  const rules = group.rules
    .map((rule) => toRule(rule, groupNames))
    .toSorted(compareRules);
  for (const { direction, empty, remote, title } of DIRECTIONS) {
    const own = rules.filter((rule) => rule.direction === direction);
    if (own.length === 0) {
      log(empty);
      continue;
    }
    log(title);
    printTable({
      headings: ["Protocol", "Ports", remote, "Ethertype"],
      marks: own.map((rule) => (isExposed(rule) ? yellow("!") : " ")),
      rows: own.map(ruleCells),
    });
    const exposure = exposureNote(own);
    if (exposure) {
      note(exposure);
    }
  }
};

export const inspect = handle(
  inspectSubcommand,
  async ({ args, client, flags }) => {
    const { active, session, space } = await client.cloud();
    const { project } = session;
    const started = performance.now();
    // The same list finds the group and names the remote groups in its rules.
    const groups = listSecurityGroups(space);
    const group = await findResource({
      kind: { ...SECURITY_GROUPS, list: () => groups },
      projectName: project.name,
      ref: args.group,
      space,
    });
    const [ports, servers] = await withSpinner(
      `Loading the servers in ${project.name}…`,
      () => Promise.all([listPorts(space), listServers(space)])
    );
    const allGroups = await groups;
    const groupNames = new Map(allGroups.map((g) => [g.id, g.name]));
    const members = membersOf(group.id, ports, servers);
    if (flags.json) {
      const rules = group.rules.map((rule) => ({
        ...rule,
        exposed: isExposed(toRule(rule, groupNames)),
        remoteGroupName: rule.remoteGroupId
          ? (groupNames.get(rule.remoteGroupId) ?? null)
          : null,
      }));
      client.stdout.json({
        profile: active.name,
        project,
        securityGroup: { ...group, rules, servers: members },
      });
      return 0;
    }
    const elapsed = dim(`[${formatElapsed(performance.now() - started)}]`);
    log(
      `Security group ${bold(group.name)} in ${bold(project.name)} ${elapsed}`
    );
    const age = `${formatAge(Date.now() - Date.parse(group.createdAt))} ago`;
    printFields([
      { label: "ID", lines: [{ text: group.id }] },
      {
        label: "Description",
        lines: group.description ? [{ text: group.description }] : [],
      },
      { label: "Servers", lines: members.map(memberCell) },
      { label: "Created", lines: [{ paint: gray, text: age }] },
    ]);
    printRules(group, groupNames);
    if (!client.stdout.isTTY) {
      client.stdout.line(group.id);
    }
    return 0;
  }
);

import { handle } from "../../util/command";
import { findResource, LOAD_BALANCERS } from "../../util/find";
import {
  diagnose,
  inspectLoadBalancer,
  isServing,
} from "../../util/load-balancer";
import type {
  BackendGroup,
  HealthCheck,
  Listener,
  LoadBalancerDetail,
  Part,
} from "../../util/load-balancer";
import { statusCell, statusLabel } from "../../util/status";
import {
  bold,
  dim,
  formatAge,
  formatElapsed,
  gray,
  log,
  note,
  plural,
  printFields,
  printTable,
  red,
  withSpinner,
} from "../../util/ui";
import type { Cell, Field } from "../../util/ui";
import { inspectSubcommand } from "./command";

const BACKEND_GROUP = "Backend group";

/** A part's name, in red when it doesn't serve. */
const nameCell = (part: Part, name: string | null): Cell => ({
  paint: isServing(part) ? undefined : red,
  text: name ?? part.id,
});

const statusCells = (part: Part): Cell[] => [
  statusCell(part.status),
  statusCell(part.health),
];

const fieldsOf = (lb: LoadBalancerDetail, now: number): Field[] => {
  const age = `${formatAge(now - Date.parse(lb.createdAt))} ago`;
  return [
    { label: "ID", lines: [{ text: lb.id }] },
    { label: "Status", lines: [statusCell(lb.status)] },
    { label: "Health", lines: [statusCell(lb.health)] },
    { label: "Address", lines: [{ text: lb.address }] },
    {
      label: "External IP",
      lines: lb.externalAddress ? [{ text: lb.externalAddress }] : [],
    },
    { label: "Flavor", lines: lb.flavor ? [{ text: lb.flavor }] : [] },
    { label: "Created", lines: [{ paint: gray, text: age }] },
  ];
};

const printListeners = (
  listeners: readonly Listener[],
  groups: readonly BackendGroup[]
): void => {
  const groupName = (id: string | null): string => {
    const group = groups.find((g) => g.id === id);
    return group ? (group.name ?? group.id) : "-";
  };
  log(plural(listeners.length, "listener"));
  printTable({
    headings: [
      "Listener",
      "Port",
      "Status",
      "Health",
      "Allowed CIDRs",
      BACKEND_GROUP,
    ],
    rows: listeners.map((listener) => [
      nameCell(listener, listener.name),
      { text: `${listener.protocol}:${listener.port}` },
      ...statusCells(listener),
      { text: listener.allowedCidrs.join(", ") || "Any" },
      { text: groupName(listener.backendGroupId) },
    ]),
  });
};

const healthCheckCell = (check: HealthCheck | null): Cell => {
  if (!check) {
    return { text: "-" };
  }
  const retries = check.maxRetries === 1 ? "retry" : "retries";
  const text = `${check.type} every ${check.delaySeconds}s, ${check.timeoutSeconds}s timeout, ${check.maxRetries} ${retries}`;
  if (isServing(check)) {
    return { text };
  }
  const state = `${statusLabel(check.status)}, ${statusLabel(check.health)}`;
  return { paint: red, text: `${text} (${state})` };
};

const printBackendGroups = (groups: readonly BackendGroup[]): void => {
  log(plural(groups.length, "backend group"));
  printTable({
    headings: [
      BACKEND_GROUP,
      "Algorithm",
      "Status",
      "Health",
      "Members",
      "Health check",
    ],
    rows: groups.map((group) => [
      nameCell(group, group.name),
      { text: group.algorithm },
      ...statusCells(group),
      { text: String(group.members.length) },
      healthCheckCell(group.healthCheck),
    ]),
  });
};

const printMembers = (groups: readonly BackendGroup[]): void => {
  const members = groups.flatMap((group) =>
    group.members.map((member) => ({ group, member }))
  );
  log(plural(members.length, "member"));
  printTable({
    headings: [
      "Member",
      "Address",
      BACKEND_GROUP,
      "Weight",
      "Backup",
      "Status",
      "Health",
    ],
    rows: members.map(({ group, member }) => [
      nameCell(member, member.name),
      { text: `${member.address}:${member.port}` },
      { text: group.name ?? group.id },
      { text: member.weight === null ? "-" : String(member.weight) },
      { text: member.backup ? "Yes" : "No" },
      ...statusCells(member),
    ]),
  });
};

export const inspect = handle(
  inspectSubcommand,
  async ({ args, client, flags }) => {
    const { active, session, space } = await client.cloud();
    const { project } = session;
    const started = performance.now();
    const { id, name } = await findResource({
      kind: LOAD_BALANCERS,
      projectName: project.name,
      ref: args.lb,
      space,
    });
    const loadBalancer = await withSpinner(
      `Loading ${name}'s listeners and members…`,
      () => inspectLoadBalancer(space, id)
    );
    if (flags.json) {
      client.stdout.json({ loadBalancer, profile: active.name, project });
      return 0;
    }
    const elapsed = dim(`[${formatElapsed(performance.now() - started)}]`);
    log(`Load balancer ${bold(name)} in ${bold(project.name)} ${elapsed}`);
    printFields(fieldsOf(loadBalancer, Date.now()));
    if (loadBalancer.listeners.length > 0) {
      printListeners(loadBalancer.listeners, loadBalancer.backendGroups);
    }
    const groups = loadBalancer.backendGroups;
    if (groups.length > 0) {
      printBackendGroups(groups);
    }
    if (groups.some((group) => group.members.length > 0)) {
      printMembers(groups);
    }
    const { details, healthy, verdict } = diagnose(loadBalancer);
    (healthy ? log : note)(`${verdict}.`);
    for (const detail of details) {
      log(`${detail}.`);
    }
    if (!client.stdout.isTTY) {
      client.stdout.line(id);
    }
    return 0;
  }
);

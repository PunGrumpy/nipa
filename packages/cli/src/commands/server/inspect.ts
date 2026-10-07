import { handle } from "../../util/command";
import {
  actionFailed,
  getServerState,
  listServerActions,
} from "../../util/compute";
import type { Server, ServerAction, ServerState } from "../../util/compute";
import { findServer } from "../../util/find";
import { statusCell } from "../../util/status";
import {
  bold,
  dim,
  formatAge,
  formatElapsed,
  gray,
  log,
  printFields,
  red,
  withDetail,
  withSpinner,
} from "../../util/ui";
import type { Cell, Field } from "../../util/ui";
import { inspectSubcommand } from "./command";
import { addressCells, flavorCell, volumeCells } from "./format";

/** "create failed 26m ago by Ann", with "create failed" in red. */
const actionCell = (action: ServerAction, now: number): Cell => {
  const failed = actionFailed(action);
  const head = failed ? `${action.action} failed` : action.action;
  const remark = failed || action.remark === null ? "" : ` (${action.remark})`;
  const by = action.user === null ? "" : ` by ${action.user}`;
  const age = formatAge(now - Date.parse(action.startedAt));
  return {
    paint: failed
      ? (text) => `${red(head)}${text.slice(head.length)}`
      : undefined,
    text: `${head}${remark} ${age} ago${by}`,
  };
};

const fieldsOf = (input: {
  server: Server;
  state: ServerState;
  lastAction: ServerAction | null;
  now: number;
}): Field[] => {
  const { lastAction, now, server, state } = input;
  const fields: Field[] = [
    { label: "ID", lines: [{ text: server.id }] },
    { label: "Status", lines: [statusCell(server.status)] },
  ];
  if (state.taskState !== null) {
    fields.push({ label: "Task", lines: [{ text: state.taskState }] });
  }
  if (state.locked === true) {
    fields.push({ label: "Locked", lines: [{ text: "yes" }] });
  }
  if (lastAction) {
    fields.push({ label: "Last action", lines: [actionCell(lastAction, now)] });
  }
  fields.push(
    { label: "Flavor", lines: [flavorCell(server)] },
    { label: "Zone", lines: server.zone ? [{ text: server.zone }] : [] },
    { label: "Addresses", lines: addressCells(server) },
    { label: "Volumes", lines: volumeCells(server) },
    {
      label: "Security groups",
      lines: server.securityGroups.map((text) => ({ text })),
    }
  );
  if (server.kubernetes) {
    const { clusterId, role } = server.kubernetes;
    fields.push({
      label: "Kubernetes",
      lines: [withDetail(role ?? "node", ` (cluster ${clusterId})`)],
    });
  }
  const age = `${formatAge(now - Date.parse(server.createdAt))} ago`;
  fields.push({ label: "Created", lines: [{ paint: gray, text: age }] });
  return fields;
};

export const inspect = handle(
  inspectSubcommand,
  async ({ args, client, flags }) => {
    const { active, session, space } = await client.cloud();
    const { project } = session;
    const started = performance.now();
    const server = await findServer({
      projectName: project.name,
      ref: args.server,
      space,
    });
    const [state, actions] = await withSpinner(
      `Loading ${server.name}'s state…`,
      () =>
        Promise.all([
          getServerState(space, server.id),
          listServerActions(space, server.id),
        ])
    );
    const lastAction = actions[0] ?? null;
    if (flags.json) {
      client.stdout.json({
        profile: active.name,
        project,
        server: {
          ...server,
          lastAction,
          locked: state.locked,
          taskState: state.taskState,
        },
      });
      return 0;
    }
    const elapsed = dim(`[${formatElapsed(performance.now() - started)}]`);
    log(`Server ${bold(server.name)} in ${bold(project.name)} ${elapsed}`);
    printFields(fieldsOf({ lastAction, now: Date.now(), server, state }));
    if (server.status === "ERROR") {
      log(
        `Run \`nipa server history ${server.name}\` to see what failed, and \`nipa server logs ${server.name}\` for its console log.`
      );
    }
    if (!client.stdout.isTTY) {
      client.stdout.line(server.id);
    }
    return 0;
  }
);

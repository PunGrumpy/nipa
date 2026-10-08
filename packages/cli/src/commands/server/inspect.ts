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
  flavorCell,
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
import { addressCells, volumeCells } from "./format";

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

/**
 * A read that inspect can do without: its value, or why it failed. The
 * server itself comes first and still fails the command.
 */
type Loaded<T> = { ok: true; value: T } | { ok: false; reason: string };

const loaded = <T>(result: PromiseSettledResult<T>): Loaded<T> => {
  if (result.status === "fulfilled") {
    return { ok: true, value: result.value };
  }
  const { reason } = result;
  return {
    ok: false,
    reason: reason instanceof Error ? reason.message : String(reason),
  };
};

const UNAVAILABLE: Cell = { paint: dim, text: "unavailable" };

const fieldsOf = (input: {
  server: Server;
  state: Loaded<ServerState>;
  actions: Loaded<ServerAction[]>;
  now: number;
}): Field[] => {
  const { actions, now, server, state } = input;
  const fields: Field[] = [
    { label: "ID", lines: [{ text: server.id }] },
    { label: "Status", lines: [statusCell(server.status)] },
  ];
  if (!state.ok) {
    fields.push(
      { label: "Task", lines: [UNAVAILABLE] },
      { label: "Locked", lines: [UNAVAILABLE] }
    );
  } else if (state.value.taskState !== null) {
    fields.push({ label: "Task", lines: [{ text: state.value.taskState }] });
  }
  if (state.ok && state.value.locked === true) {
    fields.push({ label: "Locked", lines: [{ text: "yes" }] });
  }
  const lastAction = actions.ok ? actions.value[0] : undefined;
  if (!actions.ok) {
    fields.push({ label: "Last action", lines: [UNAVAILABLE] });
  } else if (lastAction) {
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
    // The state and the actions add detail. When one of them fails, such as
    // the 503 the Space API gives while Nova works, the server still prints.
    const [stateResult, actionsResult] = await withSpinner(
      `Loading ${server.name}'s state…`,
      () =>
        Promise.allSettled([
          getServerState(space, server.id),
          listServerActions(space, server.id),
        ])
    );
    const state = loaded(stateResult);
    const actions = loaded(actionsResult);
    const logFailures = () => {
      const reads = [
        ["state", state],
        ["actions", actions],
      ] as const;
      for (const [what, read] of reads) {
        if (!read.ok) {
          log(
            `Couldn't load ${server.name}'s ${what}: ${read.reason}. Run the command again, or add \`--debug\` to see the request.`
          );
        }
      }
    };
    if (flags.json) {
      logFailures();
      client.stdout.json({
        profile: active.name,
        project,
        server: {
          ...server,
          lastAction: actions.ok ? (actions.value[0] ?? null) : null,
          locked: state.ok ? state.value.locked : null,
          taskState: state.ok ? state.value.taskState : null,
        },
      });
      return 0;
    }
    const elapsed = dim(`[${formatElapsed(performance.now() - started)}]`);
    log(`Server ${bold(server.name)} in ${bold(project.name)} ${elapsed}`);
    printFields(fieldsOf({ actions, now: Date.now(), server, state }));
    logFailures();
    if (server.status === "ERROR") {
      // The reference the person typed, so an ID stays an ID when the name
      // is ambiguous.
      log(
        `Run \`nipa server history ${args.server}\` to see what failed, and \`nipa server logs ${args.server}\` for its console log.`
      );
    }
    if (!client.stdout.isTTY) {
      client.stdout.line(server.id);
    }
    return 0;
  }
);

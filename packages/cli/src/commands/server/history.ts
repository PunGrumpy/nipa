import { handle } from "../../util/command";
import { actionFailed, listServerActions } from "../../util/compute";
import type { ServerAction } from "../../util/compute";
import { findServer } from "../../util/find";
import {
  bold,
  dim,
  formatAge,
  formatElapsed,
  gray,
  log,
  printTable,
  red,
  withSpinner,
} from "../../util/ui";
import { historySubcommand } from "./command";

const printActions = (actions: readonly ServerAction[], now: number): void => {
  printTable({
    headings: ["Age", "Action", "User", "Result", "Request ID"],
    rows: actions.map((action) => [
      { paint: gray, text: formatAge(now - Date.parse(action.startedAt)) },
      { text: action.action },
      { text: action.user ?? "-" },
      actionFailed(action)
        ? { paint: red, text: action.remark ?? "" }
        : { text: action.remark ?? "-" },
      { paint: dim, text: action.requestId },
    ]),
  });
};

export const history = handle(
  historySubcommand,
  async ({ args, client, flags }) => {
    const { active, session, space } = await client.cloud();
    const { project } = session;
    const started = performance.now();
    const server = await findServer({
      projectName: project.name,
      ref: args.server,
      space,
    });
    const actions = await withSpinner(`Loading ${server.name}'s history…`, () =>
      listServerActions(space, server.id)
    );
    if (flags.json) {
      client.stdout.json({
        actions,
        profile: active.name,
        project,
        server: { id: server.id, name: server.name },
      });
      return 0;
    }
    const elapsed = dim(`[${formatElapsed(performance.now() - started)}]`);
    const where = `${bold(server.name)} in ${bold(project.name)}`;
    if (actions.length === 0) {
      log(`No actions on ${where} ${elapsed}`);
      return 0;
    }
    log(`Actions on ${where} ${elapsed}`);
    printActions(actions, Date.now());
    if (!client.stdout.isTTY) {
      client.stdout.line(actions.map((action) => action.requestId).join("\n"));
    }
    return 0;
  }
);

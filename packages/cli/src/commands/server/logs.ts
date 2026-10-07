import { handle } from "../../util/command";
import { getConsoleLog } from "../../util/compute";
import { findServer } from "../../util/find";
import {
  bold,
  CliError,
  dim,
  formatElapsed,
  log,
  usageError,
  withSpinner,
} from "../../util/ui";
import { logsSubcommand } from "./command";

const parseTail = (text: string): number => {
  const count = Number(text);
  if (!/^\d+$/u.test(text) || count === 0) {
    throw usageError(
      `"${text}" isn't a number of lines`,
      "Write it as a whole number above 0, such as `--tail 50`."
    );
  }
  return count;
};

/**
 * The last `count` lines of `text`, each ending in a newline, or `text` as
 * the Space API sent it when there's no count.
 */
const lastLines = (text: string, count: number | undefined): string => {
  if (count === undefined) {
    return text;
  }
  const lines = text.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines
    .slice(-count)
    .map((line) => `${line}\n`)
    .join("");
};

export const logs = handle(logsSubcommand, async ({ args, client, flags }) => {
  const tail = flags.tail === undefined ? undefined : parseTail(flags.tail);
  const { active, session, space } = await client.cloud();
  const { project } = session;
  const started = performance.now();
  const server = await findServer({
    projectName: project.name,
    ref: args.server,
    space,
  });
  const consoleLog = await withSpinner(
    `Loading ${server.name}'s console log…`,
    () => getConsoleLog(space, server.id)
  );
  if (consoleLog.kind === "none") {
    throw new CliError(`${server.name} has no console log yet`, {
      hint: `A server has one once it boots, so this one most likely never booted. Run \`nipa server history ${args.server}\` to see what failed.`,
    });
  }
  const text = lastLines(consoleLog.text, tail);
  if (flags.json) {
    client.stdout.json({
      logs: text,
      profile: active.name,
      project,
      server: { id: server.id, name: server.name },
    });
    return 0;
  }
  const elapsed = dim(`[${formatElapsed(performance.now() - started)}]`);
  if (text === "") {
    log(`${bold(server.name)}'s console log is empty ${elapsed}`);
    return 0;
  }
  log(
    `Console log of ${bold(server.name)} in ${bold(project.name)} ${elapsed}`
  );
  client.stdout.write(text);
  return 0;
});

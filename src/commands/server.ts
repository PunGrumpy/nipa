import { parseArgs } from "node:util";

import { listServers } from "../lib/compute";
import type { Server } from "../lib/compute";
import {
  bold,
  CliError,
  dim,
  formatAge,
  formatElapsed,
  gray,
  green,
  log,
  printTable,
  red,
  withSpinner,
  yellow,
} from "../lib/ui";
import type { Cell, Paint } from "../lib/ui";
import { requireCloud } from "./cloud";
import type { Globals } from "./login";

interface CommandInput {
  args: string[];
  globals: Globals;
}

// Nova's statuses: ACTIVE runs, these fail or are on their way somewhere,
// and the rest, such as SHUTOFF or SHELVED, are stopped.
const STATUS_COLORS = new Map<string, Paint>([
  ["ACTIVE", green],
  ["BUILD", yellow],
  ["ERROR", red],
  ["HARD_REBOOT", yellow],
  ["MIGRATING", yellow],
  ["PASSWORD", yellow],
  ["REBOOT", yellow],
  ["REBUILD", yellow],
  ["RESCUE", yellow],
  ["RESIZE", yellow],
  ["REVERT_RESIZE", yellow],
  ["UNKNOWN", red],
  ["VERIFY_RESIZE", yellow],
]);

/** HARD_REBOOT reads as "Hard reboot". */
export const statusLabel = (status: string): string => {
  const words = status.toLowerCase().replaceAll("_", " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
};

/** The address people reach the server at: a floating IP, then IPv4. */
export const mainAddress = (server: Server): string | undefined => {
  const v4 = server.addresses.filter((a) => a.version === 4);
  const best =
    v4.find((a) => a.type === "floating") ?? v4[0] ?? server.addresses[0];
  return best?.address;
};

// Like the Vercel CLI, only the dot takes the status color.
const statusCell = (status: string): Cell => {
  const paint = STATUS_COLORS.get(status) ?? gray;
  return {
    paint: (text) => `${paint("●")}${text.slice(1)}`,
    text: `● ${statusLabel(status)}`,
  };
};

const printServers = (servers: readonly Server[], now: number): void => {
  printTable({
    headings: ["Name", "Status", "Address", "Flavor", "Age"],
    rows: servers.map((server) => [
      { text: server.name },
      statusCell(server.status),
      { text: mainAddress(server) ?? "-" },
      { text: server.flavor },
      { paint: gray, text: formatAge(now - Date.parse(server.createdAt)) },
    ]),
  });
};

const list = async ({ args, globals }: CommandInput): Promise<number> => {
  const { values } = parseArgs({
    args,
    options: { json: { type: "boolean" } },
  });
  const { active, service, session } = await requireCloud(globals);
  const { project } = session;
  const started = performance.now();
  const servers = await withSpinner(
    `Loading the servers in ${project.name}…`,
    async () => listServers(await service("compute"))
  );
  if (values.json) {
    const out = { profile: active.name, project, servers };
    console.log(JSON.stringify(out, null, 2));
    return 0;
  }
  const elapsed = dim(`[${formatElapsed(performance.now() - started)}]`);
  if (servers.length === 0) {
    log(`No servers in ${bold(project.name)} ${elapsed}`);
    return 0;
  }
  log(`Servers in ${bold(project.name)} ${elapsed}`);
  printServers(servers, Date.now());
  // A pipe gets one ID per line, because two servers can share a name.
  if (!process.stdout.isTTY) {
    console.log(servers.map((server) => server.id).join("\n"));
  }
  return 0;
};

const SUBCOMMANDS = new Map([
  ["list", list],
  ["ls", list],
]);

export const server = async (input: CommandInput): Promise<number> => {
  const [subcommand = "ls", ...rest] = input.args;
  const run = SUBCOMMANDS.get(subcommand);
  if (!run) {
    throw new CliError(`unknown subcommand "server ${subcommand}"`, {
      exitCode: 2,
      hint: "Use ls.",
    });
  }
  return await run({ args: rest, globals: input.globals });
};

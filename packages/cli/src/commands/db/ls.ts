import { handle } from "../../util/command";
import { listDatabases } from "../../util/database";
import type { Database } from "../../util/database";
import { statusCell } from "../../util/status";
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

const printDatabases = (databases: readonly Database[], now: number): void => {
  printTable({
    headings: ["Name", "Engine", "Status", "Address", "Flavor", "Age"],
    rows: databases.map(({ createdAt, name, primary }) => [
      { text: name },
      { text: primary ? `${primary.engine} ${primary.version}` : "-" },
      primary ? statusCell(primary.status) : { text: "-" },
      { text: primary ? (primary.externalAddress ?? primary.address) : "-" },
      { text: primary?.flavor ?? "-" },
      { paint: gray, text: formatAge(now - Date.parse(createdAt)) },
    ]),
  });
};

export const ls = handle(lsSubcommand, async ({ client, flags }) => {
  const { active, session, space } = await client.cloud();
  const { project } = session;
  const started = performance.now();
  const databases = await withSpinner(
    `Loading the databases in ${project.name}…`,
    () => listDatabases(space)
  );
  if (flags.json) {
    client.stdout.json({ databases, profile: active.name, project });
    return 0;
  }
  const elapsed = dim(`[${formatElapsed(performance.now() - started)}]`);
  if (databases.length === 0) {
    log(`No databases in ${bold(project.name)} ${elapsed}`);
    return 0;
  }
  log(`Databases in ${bold(project.name)} ${elapsed}`);
  printDatabases(databases, Date.now());
  // A pipe gets one ID per line, because two databases can share a name.
  if (!client.stdout.isTTY) {
    client.stdout.line(databases.map((database) => database.id).join("\n"));
  }
  return 0;
});

import { handle } from "../../util/command";
import type { Server } from "../../util/compute";
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
  withDetail,
} from "../../util/ui";
import type { Field } from "../../util/ui";
import { inspectSubcommand } from "./command";
import { addressCells, flavorCell, volumeCells } from "./format";

const fieldsOf = (server: Server, now: number): Field[] => {
  const fields: Field[] = [
    { label: "ID", lines: [{ text: server.id }] },
    { label: "Status", lines: [statusCell(server.status)] },
    { label: "Flavor", lines: [flavorCell(server)] },
    { label: "Zone", lines: server.zone ? [{ text: server.zone }] : [] },
    { label: "Addresses", lines: addressCells(server) },
    { label: "Volumes", lines: volumeCells(server) },
    {
      label: "Security groups",
      lines: server.securityGroups.map((text) => ({ text })),
    },
  ];
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
    if (flags.json) {
      client.stdout.json({ profile: active.name, project, server });
      return 0;
    }
    const elapsed = dim(`[${formatElapsed(performance.now() - started)}]`);
    log(`Server ${bold(server.name)} in ${bold(project.name)} ${elapsed}`);
    printFields(fieldsOf(server, Date.now()));
    if (!client.stdout.isTTY) {
      client.stdout.line(server.id);
    }
    return 0;
  }
);

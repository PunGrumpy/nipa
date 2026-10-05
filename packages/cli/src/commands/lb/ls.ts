import { handle } from "../../util/command";
import { listLoadBalancers } from "../../util/load-balancer";
import type { LoadBalancer } from "../../util/load-balancer";
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

const printLoadBalancers = (
  loadBalancers: readonly LoadBalancer[],
  now: number
): void => {
  printTable({
    headings: ["Name", "Status", "Health", "Address", "Listeners", "Age"],
    rows: loadBalancers.map((lb) => [
      { text: lb.name },
      statusCell(lb.status),
      statusCell(lb.health),
      { text: lb.address },
      { text: String(lb.listeners) },
      { paint: gray, text: formatAge(now - Date.parse(lb.createdAt)) },
    ]),
  });
};

export const ls = handle(lsSubcommand, async ({ client, flags }) => {
  const { active, session, space } = await client.cloud();
  const { project } = session;
  const started = performance.now();
  const loadBalancers = await withSpinner(
    `Loading the load balancers in ${project.name}…`,
    () => listLoadBalancers(space)
  );
  if (flags.json) {
    client.stdout.json({ loadBalancers, profile: active.name, project });
    return 0;
  }
  const elapsed = dim(`[${formatElapsed(performance.now() - started)}]`);
  if (loadBalancers.length === 0) {
    log(`No load balancers in ${bold(project.name)} ${elapsed}`);
    return 0;
  }
  log(`Load balancers in ${bold(project.name)} ${elapsed}`);
  printLoadBalancers(loadBalancers, Date.now());
  // A pipe gets one ID per line, because two load balancers can share a name.
  if (!client.stdout.isTTY) {
    client.stdout.line(loadBalancers.map((lb) => lb.id).join("\n"));
  }
  return 0;
});

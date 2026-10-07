import { handle } from "../../util/command";
import { listClusters } from "../../util/kubernetes";
import type { KubernetesCluster } from "../../util/kubernetes";
import {
  bold,
  dim,
  formatAge,
  formatElapsed,
  gray,
  log,
  plural,
  printTable,
  withSpinner,
} from "../../util/ui";
import { lsSubcommand } from "./command";

/** "1 master, 2 workers", in the order the nodes come. */
const nodeCounts = (cluster: KubernetesCluster): string => {
  const counts = new Map<string, number>();
  for (const node of cluster.nodes) {
    const role = node.role ?? "node";
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  return [...counts].map(([role, count]) => plural(count, role)).join(", ");
};

const activeCount = (cluster: KubernetesCluster): string => {
  const active = cluster.nodes.filter((node) => node.status === "ACTIVE");
  return `${active.length} of ${cluster.nodes.length}`;
};

const printClusters = (
  clusters: readonly KubernetesCluster[],
  now: number
): void => {
  printTable({
    headings: ["Cluster", "Version", "Nodes", "Active", "Age"],
    rows: clusters.map((cluster) => [
      { text: cluster.id },
      { text: cluster.version ?? "-" },
      { text: nodeCounts(cluster) },
      { text: activeCount(cluster) },
      { paint: gray, text: formatAge(now - Date.parse(cluster.createdAt)) },
    ]),
  });
};

export const ls = handle(lsSubcommand, async ({ client, flags }) => {
  const { active, session, space } = await client.cloud();
  const { project } = session;
  const started = performance.now();
  const clusters = await withSpinner(
    `Loading the Kubernetes clusters in ${project.name}…`,
    () => listClusters(space)
  );
  if (flags.json) {
    client.stdout.json({ clusters, profile: active.name, project });
    return 0;
  }
  const elapsed = dim(`[${formatElapsed(performance.now() - started)}]`);
  if (clusters.length === 0) {
    log(`No Kubernetes clusters in ${bold(project.name)} ${elapsed}`);
    return 0;
  }
  log(`Kubernetes clusters in ${bold(project.name)} ${elapsed}`);
  printClusters(clusters, Date.now());
  if (!client.stdout.isTTY) {
    client.stdout.line(clusters.map((cluster) => cluster.id).join("\n"));
  }
  return 0;
});

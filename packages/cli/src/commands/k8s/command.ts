import { jsonFlag } from "../../util/arg-common";
import { defineCommand, defineGroup } from "../../util/command";

const LIST_CLUSTERS = "List the Kubernetes clusters in your project";

export const lsSubcommand = defineCommand({
  aliases: ["list"],
  args: [],
  flags: [jsonFlag],
  name: "ls",
  summary: LIST_CLUSTERS,
});

export const k8sCommand = defineGroup({
  aliases: ["kubernetes", "coe"],
  default: "ls",
  description:
    "Lists the Kubernetes clusters in your project with their Kubernetes version, nodes, active node count and age. The Space API has no Kubernetes endpoint, and `nipa os coe` can't find Magnum on Nipa Cloud production, so nipa finds each cluster through the servers Magnum made for it. A cluster without servers doesn't show.",
  examples: [
    {
      command: "nipa k8s ls",
      description: LIST_CLUSTERS,
    },
    {
      command: "nipa k8s ls --json | jq -r '.clusters[0].nodes[].name'",
      description: "Print the node names of the newest cluster",
    },
  ],
  name: "k8s",
  subcommands: [lsSubcommand],
  summary: LIST_CLUSTERS,
});

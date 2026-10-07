import { handle } from "../../util/command";
import { listFlavors } from "../../util/flavor";
import type { Flavor } from "../../util/flavor";
import {
  bold,
  dim,
  formatElapsed,
  gigabytes,
  log,
  printTable,
  withSpinner,
} from "../../util/ui";
import { lsSubcommand } from "./command";

const printFlavors = (flavors: readonly Flavor[]): void => {
  printTable({
    headings: ["Name", "vCPUs", "RAM", "Type"],
    rows: flavors.map((flavor) => [
      { text: flavor.name },
      { text: String(flavor.vcpus) },
      { text: gigabytes(flavor.ramMb) },
      { text: flavor.type ?? "-" },
    ]),
  });
};

export const ls = handle(lsSubcommand, async ({ client, flags }) => {
  const { active, session, space } = await client.cloud();
  const { project } = session;
  const started = performance.now();
  const flavors = await withSpinner(
    `Loading the flavors in ${project.name}…`,
    () => listFlavors(space)
  );
  if (flags.json) {
    client.stdout.json({ flavors, profile: active.name, project });
    return 0;
  }
  const elapsed = dim(`[${formatElapsed(performance.now() - started)}]`);
  if (flavors.length === 0) {
    log(`No flavors in ${bold(project.name)} ${elapsed}`);
    return 0;
  }
  log(`Flavors in ${bold(project.name)} ${elapsed}`);
  printFlavors(flavors);
  // Unlike servers, flavors have unique names, which a script passes to openstack.
  if (!client.stdout.isTTY) {
    client.stdout.line(flavors.map((flavor) => flavor.name).join("\n"));
  }
  return 0;
});

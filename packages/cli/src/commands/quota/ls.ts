import { handle } from "../../util/command";
import { listQuotas } from "../../util/quota";
import type { Quota } from "../../util/quota";
import {
  bold,
  dim,
  formatElapsed,
  log,
  note,
  printTable,
  withSpinner,
} from "../../util/ui";
import { lsSubcommand } from "./command";
import {
  formatAmount,
  formatPercent,
  groupLabel,
  LEVEL_PAINT,
  levelOf,
  pipeLine,
  quotaLabel,
  sortQuotas,
  summarize,
} from "./format";

const printQuotas = (quotas: readonly Quota[]): void => {
  printTable({
    headings: ["Group", "Quota", "Used", "Limit", "%"],
    rows: quotas.map((quota, index) => {
      const paint = LEVEL_PAINT[levelOf(quota)];
      const firstOfGroup = quotas[index - 1]?.group !== quota.group;
      return [
        { text: firstOfGroup ? groupLabel(quota.group) : "" },
        { text: quotaLabel(quota) },
        { paint, text: formatAmount(quota.used, quota.unit) },
        {
          text:
            quota.limit === null
              ? "unlimited"
              : formatAmount(quota.limit, quota.unit),
        },
        { paint, text: formatPercent(quota) },
      ];
    }),
  });
};

export const ls = handle(lsSubcommand, async ({ client, flags }) => {
  const { active, session, space } = await client.cloud();
  const { project } = session;
  const started = performance.now();
  const quotas = sortQuotas(
    await withSpinner(`Loading the quotas of ${project.name}…`, () =>
      listQuotas(space)
    )
  );
  if (flags.json) {
    client.stdout.json({ profile: active.name, project, quotas });
    return 0;
  }
  const elapsed = dim(`[${formatElapsed(performance.now() - started)}]`);
  if (quotas.length === 0) {
    log(`No quotas for ${bold(project.name)} ${elapsed}`);
    return 0;
  }
  log(`Quotas of ${bold(project.name)} ${elapsed}`);
  printQuotas(quotas);
  const summary = summarize(quotas);
  if (summary) {
    note(summary);
  }
  if (!client.stdout.isTTY) {
    client.stdout.line(quotas.map(pipeLine).join("\n"));
  }
  return 0;
});

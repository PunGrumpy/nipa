// The checks behind `nipa doctor`: an ordered list, where a check that needs
// an earlier one skips when that one didn't pass, so no check branches on
// another's outcome.

import { CliError, plural } from "./ui";

export type CheckResult =
  | { readonly status: "pass" | "skip"; readonly summary: string }
  | {
      readonly status: "warn" | "fail";
      readonly summary: string;
      readonly hint?: string;
    };

export type CheckStatus = CheckResult["status"];

export const pass = (summary: string): CheckResult => ({
  status: "pass",
  summary,
});

export const warn = (summary: string, hint?: string): CheckResult => ({
  hint,
  status: "warn",
  summary,
});

export const fail = (summary: string, hint?: string): CheckResult => ({
  hint,
  status: "fail",
  summary,
});

export const skip = (summary: string): CheckResult => ({
  status: "skip",
  summary,
});

export interface Check<Id extends string, Context> {
  readonly id: Id;
  readonly title: string;
  /** Earlier checks that must pass or warn before this one runs. */
  readonly needs?: readonly Id[];
  readonly run: (
    context: Context,
    earlier: ReadonlyMap<Id, CheckResult>
  ) => Promise<CheckResult>;
}

export type CheckReport<Id extends string> = CheckResult & {
  readonly id: Id;
  readonly title: string;
};

/** Error messages are lowercase fragments, and summaries start with a capital. */
export const capitalize = (text: string): string =>
  `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

const usable = (result: CheckResult | undefined): boolean =>
  result?.status === "pass" || result?.status === "warn";

// A check that throws fails with the error's message, so one broken check
// doesn't hide the rest.
const attempt = async (task: () => Promise<CheckResult>) => {
  try {
    return await task();
  } catch (error) {
    if (error instanceof CliError) {
      return fail(capitalize(error.message), error.hint);
    }
    return fail(
      capitalize(error instanceof Error ? error.message : String(error))
    );
  }
};

interface Run<Id extends string, Context> {
  readonly checks: readonly Check<Id, Context>[];
  readonly context: Context;
  readonly onReport?: (report: CheckReport<Id>) => void;
}

const runFrom = async <Id extends string, Context>(
  run: Run<Id, Context>,
  reports: readonly CheckReport<Id>[]
): Promise<CheckReport<Id>[]> => {
  const check = run.checks[reports.length];
  if (!check) {
    return [...reports];
  }
  const earlier = new Map(reports.map((report) => [report.id, report]));
  const unmet = check.needs?.find((id) => !usable(earlier.get(id)));
  const title = run.checks.find((c) => c.id === unmet)?.title ?? unmet;
  const result =
    unmet === undefined
      ? await attempt(() => check.run(run.context, earlier))
      : skip(`Skipped because ${title} didn't pass`);
  const report = { ...result, id: check.id, title: check.title };
  run.onReport?.(report);
  return runFrom(run, [...reports, report]);
};

/**
 * Runs the checks one after another, because later ones read earlier ones,
 * and passes each report to `onReport` as it finishes.
 */
export const runChecks = <Id extends string, Context>(
  run: Run<Id, Context>
): Promise<CheckReport<Id>[]> => runFrom(run, []);

const COUNTS: readonly [CheckStatus, string][] = [
  ["pass", "passed"],
  ["warn", "warning"],
  ["fail", "failed"],
  ["skip", "skipped"],
];

/** `7 passed, 1 warning, 1 skipped`, leaving out the statuses no check has. */
export const tally = (statuses: readonly CheckStatus[]): string =>
  COUNTS.flatMap(([status, word]) => {
    const count = statuses.filter((s) => s === status).length;
    if (count === 0) {
      return [];
    }
    return status === "warn" ? [plural(count, word)] : [`${count} ${word}`];
  }).join(", ");

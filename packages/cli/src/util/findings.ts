// What `nipa investigate` says about one resource. Each check is a pure
// function of data a loader already read, so judging never makes a request
// and each check can be tested without HTTP.

import type { Quota } from "./quota";
import { suggestWords } from "./scope";
import type { RunScope, Suggestion } from "./scope";

/** The kinds nipa can investigate, by the word `--kind` takes. */
export const INVESTIGATED_KINDS = [
  "server",
  "lb",
  "db",
  "volume",
  "k8s",
] as const;

export type InvestigatedKind = (typeof INVESTIGATED_KINDS)[number];

/** `--json` prints these words, so they only ever grow. */
export type Severity = "problem" | "warning" | "ok";

export interface Finding {
  severity: Severity;
  /** The check that found it, such as `status` or `console-log`. Stable for scripts. */
  check: string;
  /** One sentence without a final period, such as "web-1 is in Error". */
  summary: string;
  /** The fields and values the check read, such as "status: ERROR". */
  evidence: string[];
  /** Commands that show more, in the shape a machine error's `next` has. */
  next: Suggestion[];
}

export interface Investigation {
  kind: InvestigatedKind;
  id: string;
  name: string;
  /** Problems first, then warnings, then what passed. */
  findings: Finding[];
  /** What nipa can't read for this kind of resource, so can't rule out. */
  cannotSee: string[];
}

/** A read the judge can do without: its value, or why it failed. */
export type Read<T> = { ok: true; value: T } | { ok: false; reason: string };

export const readOf = <T>(result: PromiseSettledResult<T>): Read<T> => {
  if (result.status === "fulfilled") {
    return { ok: true, value: result.value };
  }
  const { reason } = result;
  return {
    ok: false,
    reason: reason instanceof Error ? reason.message : String(reason),
  };
};

/** One check: the findings it draws from already-loaded data. */
export type Check<D> = (data: D) => Finding[];

/** A command to suggest, as the words a shell passes. */
export const nextCommand = (...words: string[]): Suggestion =>
  suggestWords(words);

export const finding = (
  severity: Severity,
  check: string,
  summary: string,
  more: { evidence?: string[]; next?: Suggestion[] } = {}
): Finding => ({
  check,
  evidence: more.evidence ?? [],
  next: more.next ?? [],
  severity,
  summary,
});

const RANK: Record<Severity, number> = { ok: 2, problem: 0, warning: 1 };

/** Runs every check on `data`, problems first. A sort keeps checks in order within a severity. */
export const judge = <D>(checks: readonly Check<D>[], data: D): Finding[] =>
  checks
    .flatMap((check) => check(data))
    .toSorted((a, b) => RANK[a.severity] - RANK[b.severity]);

/** `findings` with each `next` run in this run's profile and project. */
export const scopeFindings = (
  findings: readonly Finding[],
  scope?: RunScope
): Finding[] =>
  findings.map((found) => ({
    ...found,
    next: found.next.map((next) => suggestWords(next.argv, scope)),
  }));

/** A warning for each read that failed, so a failed read never hides as a pass. */
export const readFailures = (
  reads: readonly (readonly [what: string, read: Read<unknown>])[]
): Finding[] =>
  reads.flatMap(([what, read]) =>
    read.ok
      ? []
      : [
          finding("warning", "read", `nipa couldn't read ${what}`, {
            evidence: [`error: ${read.reason}`],
          }),
        ]
  );

/** A quota a kind of resource draws on, such as compute/instances. */
export interface QuotaRef {
  group: string;
  name: string;
  /** The noun the count reads with, such as "servers" or "MB of RAM". */
  label: string;
}

/** At or above this share of its limit, a quota is near it. */
export const NEAR_LIMIT = 0.9;

/**
 * The quotas in `refs` that are at or near their limit. A create past the
 * limit fails, so one at its limit is a problem when `failedCreate` says a
 * create failed, and a warning otherwise.
 */
export const quotaFindings = (input: {
  quotas: readonly Quota[];
  refs: readonly QuotaRef[];
  failedCreate: boolean;
}): Finding[] =>
  input.refs.flatMap((ref) => {
    const quota = input.quotas.find(
      (q) => q.group === ref.group && q.name === ref.name
    );
    if (!quota || quota.limit === null) {
      return [];
    }
    const { limit, used } = quota;
    const atLimit = used >= limit;
    if (!atLimit && used < limit * NEAR_LIMIT) {
      return [];
    }
    const severity = atLimit && input.failedCreate ? "problem" : "warning";
    const summary = atLimit
      ? `The project uses ${used} of its ${limit} ${ref.label}, so one more fails to create`
      : `The project uses ${used} of its ${limit} ${ref.label}, near the quota`;
    const unit = quota.unit ? ` ${quota.unit}` : "";
    return [
      finding(severity, "quota", summary, {
        evidence: [
          `quota ${ref.group}/${ref.name}: ${used} of ${limit}${unit}`,
        ],
        next: [nextCommand("nipa", "quota", "ls")],
      }),
    ];
  });

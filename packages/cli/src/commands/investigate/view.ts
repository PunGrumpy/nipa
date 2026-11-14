import type {
  Finding,
  InvestigatedKind,
  Investigation,
  Severity,
} from "../../util/findings";
import {
  bold,
  dim,
  green,
  log,
  note,
  plural,
  printFields,
  red,
  yellow,
} from "../../util/ui";
import type { Cell, Field, Paint } from "../../util/ui";

export const KIND_LABELS: Record<InvestigatedKind, string> = {
  db: "Database",
  k8s: "Kubernetes cluster",
  lb: "Load balancer",
  server: "Server",
  volume: "Volume",
};

const LABELS: Record<Severity, string> = {
  ok: "OK",
  problem: "Problem",
  warning: "Warning",
};

const PAINTS: Record<Severity, Paint> = {
  ok: green,
  problem: red,
  warning: yellow,
};

// What passed shows as one line. A problem or warning shows what it read
// and what to run next.
const cellsOf = (found: Finding): Cell[] => {
  const summary: Cell = { paint: PAINTS[found.severity], text: found.summary };
  if (found.severity === "ok") {
    return [summary];
  }
  return [
    summary,
    ...found.evidence.map((text): Cell => ({ paint: dim, text })),
    ...found.next.map((next): Cell => ({ text: `Run \`${next.command}\`` })),
  ];
};

export const fieldsOf = (findings: readonly Finding[]): Field[] =>
  findings.map((found) => ({
    label: LABELS[found.severity],
    lines: cellsOf(found),
  }));

const count = (findings: readonly Finding[], severity: Severity): number =>
  findings.filter((found) => found.severity === severity).length;

interface Verdict {
  /** Whether any finding is a problem, which makes the line a note. */
  problem: boolean;
  text: string;
}

/** The closing line: how many problems and warnings nipa found. */
export const verdictOf = (investigation: Investigation): Verdict => {
  const problems = count(investigation.findings, "problem");
  const warnings = count(investigation.findings, "warning");
  const warned = warnings > 0 ? ` and ${plural(warnings, "warning")}` : "";
  if (problems > 0) {
    return {
      problem: true,
      text: `Found ${plural(problems, "problem")}${warned} in what nipa can see.`,
    };
  }
  const but = warnings > 0 ? `, and ${plural(warnings, "warning")}` : "";
  return {
    problem: false,
    text: `No problem found in what nipa can see${but}.`,
  };
};

export const printInvestigation = (input: {
  investigation: Investigation;
  projectName: string;
  elapsed: string;
}): void => {
  const { investigation } = input;
  const kind = KIND_LABELS[investigation.kind];
  const elapsed = dim(`[${input.elapsed}]`);
  log(
    `${kind} ${bold(investigation.name)} in ${bold(input.projectName)} ${elapsed}`
  );
  printFields(fieldsOf(investigation.findings));
  const verdict = verdictOf(investigation);
  (verdict.problem ? note : log)(verdict.text);
  // Each blind spot can hold an "and" of its own, so "nor" joins them.
  log(`nipa can't see ${investigation.cannotSee.join(", nor ")}.`);
};

import pkg from "../../../package.json" with { type: "json" };
import { handle } from "../../util/command";
import { runChecks, tally } from "../../util/doctor";
import type { CheckReport, CheckStatus } from "../../util/doctor";
import { loadSession } from "../../util/store";
import { bold, dim, green, log, red, writeStderr, yellow } from "../../util/ui";
import type { Paint } from "../../util/ui";
import { CHECKS } from "./checks";
import type { DoctorContext } from "./checks";
import { doctorCommand } from "./command";

// Each status has its own glyph, so the line reads the same without color.
const GLYPHS: Record<CheckStatus, { glyph: string; paint: Paint }> = {
  fail: { glyph: "✖", paint: red },
  pass: { glyph: "✔", paint: green },
  skip: { glyph: "-", paint: dim },
  warn: { glyph: "!", paint: yellow },
};

const WIDTH = Math.max(...CHECKS.map((check) => check.title.length));
const GAP = "   ";

const printReport = (report: CheckReport<string>): void => {
  const { glyph, paint } = GLYPHS[report.status];
  const title = bold(report.title.padEnd(WIDTH));
  const summary =
    report.status === "skip" ? dim(report.summary) : report.summary;
  writeStderr(`${paint(glyph)} ${title}${GAP}${summary}`);
  if ("hint" in report && report.hint) {
    const indent = " ".repeat(2 + WIDTH + GAP.length);
    writeStderr(`${indent}${dim(">")} ${report.hint}`);
  }
};

export const doctor = handle(doctorCommand, async ({ client, flags }) => {
  const context: DoctorContext = {
    profile: client.profile,
    session: async () => {
      const active = await client.profile();
      return loadSession(active.name);
    },
    version: pkg.version,
  };
  const reports = await runChecks({
    checks: CHECKS,
    context,
    onReport: flags.json ? undefined : printReport,
  });
  if (flags.json) {
    const resolved = reports.some(
      (report) => report.id === "profile" && report.status === "pass"
    );
    const active = resolved ? await client.profile() : undefined;
    client.stdout.json({
      checks: reports.map((report) => ({
        hint: ("hint" in report && report.hint) || null,
        id: report.id,
        status: report.status,
        summary: report.summary,
        title: report.title,
      })),
      profile: active?.name ?? null,
    });
  } else {
    writeStderr("");
    log(tally(reports.map((report) => report.status)));
  }
  return reports.some((report) => report.status === "fail") ? 1 : 0;
});

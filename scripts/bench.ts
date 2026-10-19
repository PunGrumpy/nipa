#!/usr/bin/env bun

// Times the type checkers on each workspace: TypeScript 6, which both
// workspaces used before, against the TypeScript 7 compiler that apps/web pins
// and the tsc-ts that the root pins. Each compiler is installed into a
// temporary directory and run through its npm bin, as `bun run typecheck` runs
// it.
//
//   bun run bench [--runs 10] [--json]

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

const WARMUP = 2;
// The compiler both workspaces ran before they moved to TypeScript 7.
const BASELINE = { bin: "tsc", pkg: "typescript", version: "6.0.3" };

interface Sample {
  cpu: number;
  rss: number;
  wall: number;
}

interface Stats {
  median: number;
  sd: number;
}

interface Entry {
  cmd: string[];
  label: string;
  samples: Sample[];
}

interface Result {
  check: string;
  compiler: string;
  cpu: Stats;
  rss: Stats;
  runs: number;
  wall: Stats;
  workspace: string;
}

const { values } = parseArgs({
  options: {
    json: { default: false, type: "boolean" },
    runs: { default: "10", type: "string" },
  },
});
const runs = Number(values.runs);
if (!Number.isInteger(runs) || runs < 2) {
  throw new Error(
    `--runs takes a whole number of at least 2, not ${values.runs}`
  );
}

const root = path.join(import.meta.dir, "..");

const pinned = (workspace: string, name: string): string => {
  const manifest: { devDependencies?: Record<string, string> } = JSON.parse(
    readFileSync(path.join(root, workspace, "package.json"), "utf-8")
  );
  const version = manifest.devDependencies?.[name];
  if (!version) {
    throw new Error(`${workspace}/package.json has no ${name} devDependency`);
  }
  return version;
};

const COMPILERS = [
  BASELINE,
  { bin: "tsc", pkg: "typescript", version: pinned("apps/web", "typescript") },
  { bin: "tsc-ts", pkg: "tsc-ts", version: pinned(".", "tsc-ts") },
];

const WORKSPACES = [
  { name: "packages/cli" },
  // The project includes the route types that `next typegen` writes.
  { name: "apps/web", prepare: [process.execPath, "x", "next", "typegen"] },
];

const CHECKS = [
  { args: () => ["--noEmit", "--incremental", "false"], name: "cold" },
  // A re-check with nothing changed, reading the compiler's own build info.
  {
    args: (buildInfo: string) => [
      "--noEmit",
      "--incremental",
      "--tsBuildInfoFile",
      buildInfo,
    ],
    name: "incremental",
    primed: true,
  },
];

const run = (cmd: string[], cwd: string): Sample => {
  const start = performance.now();
  const proc = Bun.spawnSync(cmd, { cwd, stderr: "pipe", stdout: "pipe" });
  const wall = (performance.now() - start) / 1000;
  if (proc.exitCode !== 0) {
    throw new Error(
      `${cmd.join(" ")} exited with ${proc.exitCode} in ${cwd}\n${proc.stdout.toString()}${proc.stderr.toString()}`
    );
  }
  // The usage covers the native compiler that the npm bin starts.
  const usage = proc.resourceUsage;
  return {
    cpu: Number(usage.cpuTime.total) / 1e6,
    rss: usage.maxRSS / 2 ** 20,
    wall,
  };
};

const stats = (xs: number[]): Stats => {
  const sorted = xs.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const at = (i: number) => sorted[i] ?? Number.NaN;
  const median =
    sorted.length % 2 === 0 ? (at(mid - 1) + at(mid)) / 2 : at(mid);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance =
    xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
  return { median, sd: Math.sqrt(variance) };
};

const seconds = (s: number) => `${s.toFixed(2)} s`;

const progress = (text: string) => {
  if (process.stderr.isTTY) {
    process.stderr.write(`\r\u001B[K${text}`);
  }
};

const work = mkdtempSync(path.join(os.tmpdir(), "nipa-bench-"));
try {
  const compilers = COMPILERS.map(({ bin, pkg, version }) => {
    const label = `${pkg} ${version}`;
    progress(`installing ${label}`);
    const dir = path.join(work, `${pkg}-${version}`);
    mkdirSync(dir);
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ dependencies: { [pkg]: version }, private: true })
    );
    run([process.execPath, "install"], dir);
    return { bin: path.join(dir, "node_modules", ".bin", bin), label };
  });

  const bench = (
    workspace: string,
    check: (typeof CHECKS)[number]
  ): Result[] => {
    const cwd = path.join(root, workspace);
    const entries = compilers.map((compiler, i): Entry => ({
      cmd: [
        compiler.bin,
        ...check.args(
          path.join(work, `${i}-${workspace.replace("/", "-")}.tsbuildinfo`)
        ),
      ],
      label: compiler.label,
      samples: [],
    }));
    if (check.primed) {
      for (const { cmd } of entries) {
        run(cmd, cwd);
      }
    }
    // Compilers alternate within each round, so a slow moment hits all of them.
    for (let round = 1; round <= WARMUP + runs; round += 1) {
      progress(
        `${workspace} ${check.name}: round ${round} of ${WARMUP + runs}`
      );
      for (const entry of entries) {
        const sample = run(entry.cmd, cwd);
        if (round > WARMUP) {
          entry.samples.push(sample);
        }
      }
    }
    return entries.map(({ label, samples }) => ({
      check: check.name,
      compiler: label,
      cpu: stats(samples.map((s) => s.cpu)),
      rss: stats(samples.map((s) => s.rss)),
      runs: samples.length,
      wall: stats(samples.map((s) => s.wall)),
      workspace,
    }));
  };

  const results: Result[] = [];
  for (const workspace of WORKSPACES) {
    if (workspace.prepare) {
      run(workspace.prepare, path.join(root, workspace.name));
    }
    for (const check of CHECKS) {
      results.push(...bench(workspace.name, check));
    }
  }
  progress("");

  const node = Bun.spawnSync(["node", "--version"], { cwd: root })
    .stdout.toString()
    .trim();
  const cpus = os.cpus();
  const environment = [
    cpus[0]?.model ?? "unknown CPU",
    `${cpus.length} cores`,
    `${Math.round(os.totalmem() / 2 ** 30)} GB`,
    `${process.platform} ${process.arch}`,
    `Node ${node}`,
    `Bun ${Bun.version}`,
  ].join(" · ");

  if (values.json) {
    console.log(
      JSON.stringify({ environment, results, runs, warmup: WARMUP }, null, 2)
    );
  } else {
    const baseline = `${BASELINE.pkg} ${BASELINE.version}`;
    const lines = [
      environment,
      `Median of ${runs} runs after ${WARMUP} warm-up runs.`,
      "",
      `| Workspace | Check | Compiler | Wall | ±SD | CPU | Peak RSS | vs ${baseline} |`,
      "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ];
    for (const r of results) {
      const base = results.find(
        (b) =>
          b.workspace === r.workspace &&
          b.check === r.check &&
          b.compiler === baseline
      );
      const speedup =
        r.compiler === baseline || !base
          ? "—"
          : `${(base.wall.median / r.wall.median).toFixed(1)}×`;
      lines.push(
        `| ${r.workspace} | ${r.check} | ${r.compiler} | ${seconds(r.wall.median)} | ${seconds(r.wall.sd)} | ${seconds(r.cpu.median)} | ${Math.round(r.rss.median)} MB | ${speedup} |`
      );
    }
    console.log(lines.join("\n"));
  }
} finally {
  rmSync(work, { force: true, recursive: true });
}

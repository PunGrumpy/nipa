// Help pages and usage lines come from the specs, so they always list the
// flags, arguments and subcommands the parser accepts.

import pc from "picocolors";

import { GLOBAL_FLAGS } from "./arg-common";
import { flagPlaceholder, subjectOf } from "./spec";
import type {
  ArgSpec,
  CommandPath,
  CommandSpec,
  Example,
  FlagSpec,
  ProgramSpec,
  Target,
} from "./spec";

type Row = readonly [label: string, description: string];

const INDENT = "    ";
const LINE_WIDTH = 80;

const table = (rows: readonly Row[], width: number): string =>
  rows
    .map(
      ([label, description]) =>
        `${INDENT}${label.padEnd(width)}   ${description}`
    )
    .join("\n");

const labelWidth = (rows: readonly Row[]): number =>
  Math.max(0, ...rows.map(([label]) => label.length));

const wrap = (text: string, indent: string): string => {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && indent.length + line.length + 1 + word.length > LINE_WIDTH) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  lines.push(line);
  return lines.map((l) => `${indent}${l}`).join("\n");
};

const argWord = (arg: ArgSpec): string => {
  switch (arg.arity) {
    case "one": {
      return `<${arg.name}>`;
    }
    case "optional": {
      return `[${arg.name}]`;
    }
    case "rest": {
      return `[${arg.name}...]`;
    }
    default: {
      const _exhaustive: never = arg.arity;
      return _exhaustive;
    }
  }
};

/** One flag without a value reads `[--json]`. Anything more reads `[options]`. */
const flagsWord = (flags: readonly FlagSpec[]): readonly string[] => {
  const [first, ...rest] = flags;
  if (!first) {
    return [];
  }
  if (rest.length === 0 && first.value.kind === "none") {
    return [`[--${first.long}]`];
  }
  return ["[options]"];
};

const targetWords = (target: Target): string => {
  switch (target.kind) {
    case "program":
    case "openstack": {
      return "<args...>";
    }
    case "command": {
      return "<command> [args...]";
    }
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
};

/** The words after the command's name in a usage line, such as `[name] [options]`. */
export const usageOf = (spec: CommandSpec): string => {
  switch (spec.kind) {
    case "leaf": {
      return [...spec.args.map(argWord), ...flagsWord(spec.flags)].join(" ");
    }
    case "group": {
      return `[${spec.subcommands.map((sub) => sub.name).join("|")}]`;
    }
    case "passthrough": {
      return targetWords(spec.target);
    }
    default: {
      const _exhaustive: never = spec;
      return _exhaustive;
    }
  }
};

/** `nipa profile rm`. */
export const commandLine = (path: CommandPath): string =>
  `nipa ${path.map((spec) => spec.name).join(" ")}`;

/** `nipa profile rm <name> [--yes]`. Usage errors quote it in their hints. */
export const usageLine = (path: CommandPath): string => {
  const usage = usageOf(subjectOf(path));
  return usage ? `${commandLine(path)} ${usage}` : commandLine(path);
};

/**
 * A leaf's own flags. A group's page lists its subcommands' flags, each
 * once, so `server ls --json` and `server inspect --json` show one `--json`.
 */
const pageFlags = (spec: CommandSpec): readonly FlagSpec[] => {
  switch (spec.kind) {
    case "leaf": {
      return spec.flags;
    }
    case "group": {
      const all = spec.subcommands.flatMap((sub) => sub.flags);
      return all.filter(
        (flag, index) => all.findIndex((f) => f.long === flag.long) === index
      );
    }
    case "passthrough": {
      return [];
    }
    default: {
      const _exhaustive: never = spec;
      return _exhaustive;
    }
  }
};

const flagRow = (flag: FlagSpec): Row => {
  const short = flag.short ? `-${flag.short}, ` : "    ";
  return [
    `${short}--${flag.long}${flagPlaceholder(flag.value)}`,
    flag.description,
  ];
};

const commandRow = (spec: CommandSpec): Row => {
  const usage = usageOf(spec);
  return [usage ? `${spec.name} ${usage}` : spec.name, spec.summary];
};

const section = (title: string, body: string): string => {
  const heading = pc.dim(`${title}:`);
  return `  ${heading}\n\n${body}\n`;
};

const examples = (list: readonly Example[]): string =>
  list
    .map(
      (e) =>
        `${INDENT}${pc.dim(e.description)}\n${INDENT}${pc.cyan("$")} ${e.command}`
    )
    .join("\n\n");

const globalRows = GLOBAL_FLAGS.map(flagRow);

export const mainHelp = (input: {
  program: ProgramSpec;
  version: string;
}): string => {
  const { program } = input;
  const rows = program.sections.flatMap((s) => s.commands.map(commandRow));
  const width = labelWidth([...rows, ...globalRows]);
  const groups = program.sections.map((s) =>
    section(s.title, table(s.commands.map(commandRow), width))
  );
  const version = pc.dim(`v${input.version}`);
  return [
    "",
    `  ${pc.bold("nipa")} ${version}`,
    "",
    wrap(program.summary, "  "),
    "",
    `  ${pc.dim("Usage:")} nipa [options] <command>`,
    "",
    ...groups,
    section("Global options", table(globalRows, width)),
    section("Examples", examples(program.examples)),
    `  Run ${pc.bold("nipa <command> --help")} for a command's options.`,
    "",
  ].join("\n");
};

/**
 * The page for `nipa <command> --help`, `nipa help <command>`, and, for a
 * group's subcommand, `nipa <group> <subcommand> --help`.
 */
export const commandHelp = (path: CommandPath): string => {
  const subject = subjectOf(path);
  const subcommandRows =
    subject.kind === "group" ? subject.subcommands.map(commandRow) : [];
  const flagRows = pageFlags(subject).map(flagRow);
  const width = labelWidth([...subcommandRows, ...flagRows, ...globalRows]);
  const parts = [
    "",
    `  ${pc.dim("Usage:")} ${usageLine(path)}`,
    "",
    wrap(subject.description ?? subject.summary, "  "),
    "",
  ];
  if (subcommandRows.length > 0) {
    parts.push(section("Subcommands", table(subcommandRows, width)));
  }
  if (flagRows.length > 0) {
    parts.push(section("Options", table(flagRows, width)));
  }
  parts.push(section("Global options", table(globalRows, width)));
  if (subject.examples?.length) {
    parts.push(section("Examples", examples(subject.examples)));
  }
  return parts.join("\n");
};

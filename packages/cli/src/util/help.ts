// Help pages and usage lines come from the specs, so they always list the
// flags, arguments and subcommands the parser accepts.
//
// Every page fits 80 columns. A table puts a row's description beside its
// label when both fit, and below the label, wrapped, when they don't. A
// label is never cut.

import { GLOBAL_FLAGS } from "./arg-common";
import { flagPlaceholder, subjectOf, visibleCommands } from "./spec";
import type {
  ArgSpec,
  CommandPath,
  CommandSpec,
  Example,
  FlagSpec,
  ProgramSpec,
  Target,
} from "./spec";
import { theme } from "./theme";

type Row = readonly [label: string, description: string];

// Help goes to stdout, so stdout decides its colors.
const colors = theme.stdout;

const MARGIN = "  ";
const INDENT = "    ";
const LINE_WIDTH = 80;
const GAP = "   ";
/** An example's command sits two columns in from its description. */
const BELOW = `${INDENT}  `;
/** A label wider than this never sets the column, so one long flag can't push every description down. */
const WIDEST_COLUMN = 30;

/** Breaks `text` at spaces so each line, with `indent`, fits the page. A longer word keeps its own line. */
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

/** The width of the label column for the rows that share it. */
const labelWidth = (...tables: readonly (readonly Row[])[]): number =>
  Math.max(
    0,
    ...tables
      .flat()
      .map(([label]) => label.length)
      .filter((length) => length <= WIDEST_COLUMN)
  );

/**
 * Where a description that wraps under its label starts: two columns in from
 * the label's text. A long-only flag is padded to leave room for `-x, `, so
 * its text starts four columns later than a flag with a short form, and its
 * description goes with it.
 */
const belowLabel = (label: string): string =>
  `${INDENT}${" ".repeat(label.length - label.trimStart().length)}  `;

const table = (rows: readonly Row[], width: number): string =>
  rows
    .map(([label, description]) => {
      const beside = `${INDENT}${label.padEnd(width)}${GAP}${description}`;
      if (!description) {
        return `${INDENT}${label}`;
      }
      if (label.length <= WIDEST_COLUMN && beside.length <= LINE_WIDTH) {
        return beside;
      }
      return `${INDENT}${label}\n${wrap(description, belowLabel(label))}`;
    })
    .join("\n");

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
 * A leaf's own flags. A group's page lists the flags of the subcommand that
 * runs when the group's name comes alone, so it never shows an option the bare
 * group rejects. Each subcommand's own page lists its own flags.
 */
const pageFlags = (spec: CommandSpec): readonly FlagSpec[] => {
  switch (spec.kind) {
    case "leaf": {
      return spec.flags;
    }
    case "group": {
      return (
        spec.subcommands.find((sub) => sub.name === spec.default)?.flags ?? []
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

/** Options read in alphabetical order of their long names, on every page. */
const sortedFlags = (flags: readonly FlagSpec[]): readonly FlagSpec[] =>
  flags.toSorted((a, b) => {
    if (a.long === b.long) {
      return 0;
    }
    return a.long < b.long ? -1 : 1;
  });

const flagRows = (flags: readonly FlagSpec[]): readonly Row[] =>
  sortedFlags(flags).map((flag): Row => {
    const short = flag.short ? `-${flag.short}, ` : "    ";
    return [
      `${short}--${flag.long}${flagPlaceholder(flag.value)}`,
      flag.description,
    ];
  });

/** A subcommand's row keeps its arguments: the page names one command's children. */
const subcommandRow = (spec: CommandSpec): Row => {
  const usage = usageOf(spec);
  return [usage ? `${spec.name} ${usage}` : spec.name, spec.summary];
};

/** The root page lists names only, so a new subcommand never widens it. */
const nameRow = (spec: CommandSpec): Row => [spec.name, spec.summary];

const heading = (title: string): string =>
  colors.bold(colors.magenta(`${title}:`));

const section = (title: string, body: string): string =>
  `${MARGIN}${heading(title)}\n\n${body}\n`;

/** A description, then its command two columns further in. Neither has a prompt mark. */
const examples = (list: readonly Example[]): string =>
  list
    .map(
      (e) =>
        `${colors.dim(wrap(e.description, INDENT))}\n${BELOW}${colors.cyan(e.command)}`
    )
    .join("\n\n");

const usageHeading = (path: string): string =>
  `${MARGIN}${heading("Usage")} ${path}`;

const MAIN_USAGE = "nipa [options] <command>";

const globalRows = flagRows(GLOBAL_FLAGS);

export const mainHelp = (input: {
  program: ProgramSpec;
  version: string;
}): string => {
  const { program } = input;
  const commandWidth = labelWidth(
    program.sections.flatMap((s) => s.commands.map(nameRow))
  );
  const groups = program.sections.map((s) =>
    section(s.title, table(s.commands.map(nameRow), commandWidth))
  );
  const version = colors.dim(`v${input.version}`);
  return [
    "",
    `${MARGIN}${colors.bold("nipa")} ${version}`,
    "",
    wrap(program.summary, MARGIN),
    "",
    usageHeading(MAIN_USAGE),
    "",
    ...groups,
    section("Global Options", table(globalRows, labelWidth(globalRows))),
    section("Examples", examples(program.examples)),
  ].join("\n");
};

/**
 * The page for `nipa <command> --help`, `nipa help <command>`, and, for a
 * group's subcommand, `nipa <group> <subcommand> --help`.
 */
export const commandHelp = (path: CommandPath): string => {
  const subject = subjectOf(path);
  const subcommandRows =
    subject.kind === "group" ? subject.subcommands.map(subcommandRow) : [];
  const optionRows = flagRows(pageFlags(subject));
  const width = labelWidth(subcommandRows, optionRows);
  const parts = [
    "",
    usageHeading(usageLine(path)),
    wrap(subject.summary, MARGIN),
    "",
  ];
  if (subject.description) {
    parts.push(wrap(subject.description, MARGIN), "");
  }
  if (subcommandRows.length > 0) {
    parts.push(section("Subcommands", table(subcommandRows, width)));
  }
  if (optionRows.length > 0) {
    parts.push(section("Options", table(optionRows, width)));
  }
  parts.push(`${MARGIN}${heading("Global Options")} nipa --help\n`);
  if (subject.examples?.length) {
    parts.push(section("Examples", examples(subject.examples)));
  }
  return parts.join("\n");
};

export interface HelpOption {
  readonly choices?: readonly string[];
  readonly description: string;
  /** The long name, without dashes. */
  readonly name: string;
  readonly short?: string;
  readonly type: "boolean" | "string";
  /** `<duration>`, as the human page shows it. */
  readonly valueHint?: string;
}

export interface HelpArgument {
  readonly choices?: readonly string[];
  readonly name: string;
  readonly required: boolean;
  readonly variadic: boolean;
}

interface HelpSubcommand {
  readonly name: string;
  readonly summary: string;
}

export interface HelpDocument {
  readonly aliases: readonly string[];
  readonly arguments: readonly HelpArgument[];
  readonly default?: string;
  readonly description?: string;
  readonly examples: readonly Example[];
  readonly kind: "command" | "group" | "passthrough";
  readonly options: readonly HelpOption[];
  readonly path: readonly string[];
  readonly subcommands: readonly HelpSubcommand[];
  readonly summary: string;
  readonly usage: string;
}

export interface MainHelpDocument {
  readonly examples: readonly Example[];
  readonly globalOptions: readonly HelpOption[];
  readonly path: readonly ["nipa"];
  readonly subcommands: readonly HelpSubcommand[];
  readonly summary: string;
  readonly usage: string;
  readonly version: string;
}

export interface AllHelpDocument {
  readonly commands: readonly HelpDocument[];
  readonly globalOptions: readonly HelpOption[];
  readonly version: string;
}

const helpOption = (flag: FlagSpec): HelpOption => {
  const hint = flagPlaceholder(flag.value).trim();
  return {
    ...(flag.value.kind === "choice" && { choices: [...flag.value.choices] }),
    description: flag.description,
    name: flag.long,
    ...(flag.short && { short: flag.short }),
    type: flag.value.kind === "none" ? "boolean" : "string",
    ...(hint && { valueHint: hint }),
  };
};

const helpOptions = (flags: readonly FlagSpec[]): readonly HelpOption[] =>
  sortedFlags(flags).map(helpOption);

const helpArgument = (arg: ArgSpec): HelpArgument => ({
  ...(arg.value.kind === "choice" && { choices: [...arg.value.choices] }),
  name: arg.name,
  required: arg.arity === "one",
  variadic: arg.arity === "rest",
});

const helpSubcommand = (spec: CommandSpec): HelpSubcommand => ({
  name: spec.name,
  summary: spec.summary,
});

/** The document for `nipa <command> --help --json`, from the same specs as `commandHelp`. */
export const commandHelpDocument = (path: CommandPath): HelpDocument => {
  const subject = subjectOf(path);
  return {
    aliases: [...(subject.aliases ?? [])],
    arguments: subject.kind === "leaf" ? subject.args.map(helpArgument) : [],
    ...(subject.kind === "group" && { default: subject.default }),
    ...(subject.description && { description: subject.description }),
    examples: [...(subject.examples ?? [])],
    kind: subject.kind === "leaf" ? "command" : subject.kind,
    options: helpOptions(pageFlags(subject)),
    path: ["nipa", ...path.map((spec) => spec.name)],
    subcommands:
      subject.kind === "group" ? subject.subcommands.map(helpSubcommand) : [],
    summary: subject.summary,
    usage: usageLine(path),
  };
};

/** The document for `nipa --help --json`. */
export const mainHelpDocument = (input: {
  program: ProgramSpec;
  version: string;
}): MainHelpDocument => ({
  examples: [...input.program.examples],
  globalOptions: helpOptions(GLOBAL_FLAGS),
  path: ["nipa"],
  subcommands: visibleCommands(input.program).map(helpSubcommand),
  summary: input.program.summary,
  usage: MAIN_USAGE,
  version: input.version,
});

/** The document for `nipa help --all --json`: every listed command, each group followed by its subcommands. */
export const allHelpDocument = (input: {
  program: ProgramSpec;
  version: string;
}): AllHelpDocument => ({
  commands: visibleCommands(input.program).flatMap((command) => [
    commandHelpDocument([command]),
    ...(command.kind === "group"
      ? command.subcommands.map((sub) => commandHelpDocument([command, sub]))
      : []),
  ]),
  globalOptions: helpOptions(GLOBAL_FLAGS),
  version: input.version,
});

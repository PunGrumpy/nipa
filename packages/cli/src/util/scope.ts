// The commands nipa suggests run in the profile and project this run named.
// A hint that says "Run `nipa server start db-1`" after `nipa -p Beta server
// restart db-1` would start the server in the saved project, so the writers
// of hints and recovery commands pass what they print through here. Throw
// sites keep writing the plain command.

import type { CommandPath, CommandSpec, ProgramSpec } from "./spec";
import { namesOf, profileUseOf, projectUseOf } from "./spec";

/**
 * The global options this run was given that a suggested command repeats,
 * with the specs that say which commands take them.
 */
export interface RunScope {
  /** `-P`, as given. */
  readonly profile?: string;
  /** `-p`, as given. */
  readonly project?: string;
  readonly program: ProgramSpec;
}

/** A suggested command: the words a shell passes, and the line to print. */
export interface Suggestion {
  readonly argv: string[];
  readonly command: string;
}

let current: RunScope | undefined;

/** run() sets it once the global options are read, and clears it at the start of a run. */
export const setRunScope = (scope: RunScope | undefined): void => {
  current = scope;
};

export const runScope = (): RunScope | undefined => current;

const SAFE_WORD = /^[\w%+,./:=@-]+$/u;

// A name with a line break must not start a second line of nipa's output. The
// argv keeps the name as it is.
const flatten = (word: string): string =>
  word
    .replaceAll("\r", String.raw`\r`)
    .replaceAll("\n", String.raw`\n`)
    .replaceAll("\t", String.raw`\t`);

/** One word for a shell: bare when it is safe, else in single quotes. */
export const shellQuote = (
  word: string,
  platform: NodeJS.Platform = process.platform
): string => {
  if (SAFE_WORD.test(word)) {
    return word;
  }
  const flat = flatten(word);
  // PowerShell doubles a quote inside single quotes. A POSIX shell closes
  // the quotes, escapes the quote and opens them again.
  const escaped =
    platform === "win32"
      ? flat.replaceAll("'", "''")
      : flat.replaceAll("'", String.raw`'\''`);
  return `'${escaped}'`;
};

const PROFILE_WORDS = new Set(["-P", "--profile"]);
const PROJECT_WORDS = new Set(["-p", "--project"]);

const findCommand = (
  program: ProgramSpec,
  word: string | undefined
): CommandSpec | undefined =>
  [...program.sections.flatMap((s) => s.commands), ...program.hidden].find(
    (spec) => word !== undefined && namesOf(spec).includes(word)
  );

interface Named {
  readonly path: CommandPath | null;
  readonly profile: boolean;
  readonly project: boolean;
}

const givesFlag = (word: string, spellings: ReadonlySet<string>): boolean =>
  spellings.has(word.split("=")[0] ?? "");

/**
 * The command the words after `nipa` name, and whether they already say
 * which profile and project. A passthrough command's own words are its
 * program's, so only the options before the command count there.
 */
const nameCommand = (program: ProgramSpec, words: readonly string[]): Named => {
  let at = 0;
  while (words[at]?.startsWith("-")) {
    // A global option with a value takes the next word, unless it is --flag=value.
    const word = words[at] ?? "";
    const takesValue =
      (PROFILE_WORDS.has(word) || PROJECT_WORDS.has(word)) &&
      !word.includes("=");
    at += takesValue ? 2 : 1;
  }
  const command = findCommand(program, words[at]);
  const scanned = command?.kind === "passthrough" ? at : words.length;
  const seen = words.slice(0, scanned);
  const given = {
    profile: seen.some((word) => givesFlag(word, PROFILE_WORDS)),
    project: seen.some((word) => givesFlag(word, PROJECT_WORDS)),
  };
  if (!command) {
    return { path: null, ...given };
  }
  if (command.kind !== "group") {
    return { path: [command], ...given };
  }
  const sub = command.subcommands.find((leaf) =>
    namesOf(leaf).includes(words[at + 1] ?? "")
  );
  return { path: sub ? [command, sub] : [command], ...given };
};

/** The options to insert after `nipa`, as words. Empty for a text that isn't a nipa command. */
const optionsFor = (scope: RunScope, words: readonly string[]): string[] => {
  const { path, profile, project } = nameCommand(scope.program, words);
  if (!path) {
    return [];
  }
  const options: string[] = [];
  if (scope.profile !== undefined && !profile && profileUseOf(path) !== false) {
    options.push("-P", scope.profile);
  }
  // `login -p` saves the project, so a suggestion of it never repeats the run's.
  if (
    scope.project !== undefined &&
    !project &&
    projectUseOf(path) === undefined
  ) {
    options.push("-p", scope.project);
  }
  return options;
};

/**
 * A suggested command with this run's `-P` and `-p` after `nipa`. `command`
 * is a whole static command such as `nipa server ls`; only the inserted
 * words are quoted, so a name with spaces is one argv word.
 */
export const suggest = (command: string, scope?: RunScope): Suggestion => {
  const [head, ...rest] = command.split(" ");
  const options = scope && head === "nipa" ? optionsFor(scope, rest) : [];
  return {
    argv: [head ?? "", ...options, ...rest],
    command: [head, ...options.map((word) => shellQuote(word)), ...rest].join(
      " "
    ),
  };
};

// A command in backticks, such as `nipa server start db-1`.
const SPAN = /`nipa(?: [^\n`]*)?`/gu;

/**
 * Human text with each backticked `nipa …` command run in this run's profile
 * and project. Text that isn't a nipa command, such as `--yes` or
 * `nipa --help`, comes back as it was.
 */
export const scopedText = (text: string, scope?: RunScope): string =>
  scope
    ? text.replaceAll(
        SPAN,
        (span) => `\`${suggest(span.slice(1, -1), scope).command}\``
      )
    : text;

/** scopedText in the scope of the run in progress, for the writers of hints, notes and logs. */
export const inRun = (text: string): string => scopedText(text, current);

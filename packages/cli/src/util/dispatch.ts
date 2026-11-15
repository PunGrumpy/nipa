// The one dispatcher. It walks the words through the table: global options,
// then the command, then for a group the subcommand, then the leaf's own
// words. It handles help, the version and the global options the same way
// for every command, so no command folder writes a dispatch switch or a
// help check.

import type { GlobalValues } from "./arg-common";
import type { Client } from "./client";
import { programSpec } from "./command";
import type { Command, Group, Leaf, Program } from "./command";
import { commandHelp, commandLine, mainHelp, usageLine } from "./help";
import { asksForHelp, asksForJson, asksForVersion, takeGlobals } from "./parse";
import { profileAmong, projectAmong, setRunScope } from "./scope";
import type { RunScope } from "./scope";
import { namesOf, profileUseOf, projectUseOf } from "./spec";
import type { CommandPath, ProgramSpec } from "./spec";
import { CliError, setJsonMode, usageError } from "./ui";

/** What a run ended with. src/index.ts prints, sets the exit code and shows the update notice. */
export type Outcome =
  /** Help or the version, for stdout. Exit 0. */
  | { readonly kind: "print"; readonly text: string }
  /**
   * A handler ran. `updateNotice` is false when a spec on its path says so.
   * `interactive` is the run's prompt mode, which the update check follows.
   */
  | {
      readonly exitCode: number;
      readonly interactive: boolean;
      readonly kind: "ran";
      readonly updateNotice: boolean;
    };

export interface RunInput {
  /** process.argv.slice(2). */
  readonly argv: readonly string[];
  /** Makes the run's client once every global option is known. Tests can pass a fake. */
  readonly createClient: (input: {
    globals: GlobalValues;
    json: boolean;
    program: ProgramSpec;
  }) => Client;
  readonly program: Program;
  readonly version: string;
}

/**
 * What the words after a command name: a leaf to run, with the path help
 * and usage lines name and the leaf's words, or a word that names none of
 * a group's subcommands, which is an error whatever else the line asks for.
 */
type Resolved =
  | {
      readonly kind: "leaf";
      readonly leaf: Leaf;
      readonly path: CommandPath;
      readonly words: readonly string[];
    }
  | { readonly kind: "unknown"; readonly group: Group; readonly word: string };

/**
 * The profile and project the commands nipa suggests repeat. Before the
 * command is known, that is whatever the line said. Once it is, a command
 * that names profiles itself (`profile`) repeats no `-P`, and one where `-p`
 * saves a project (`login`) or means nothing repeats no `-p`.
 */
const scopeOf = (input: {
  globals: GlobalValues;
  path?: CommandPath;
  program: ProgramSpec;
}): RunScope => {
  const { globals, path, program } = input;
  return {
    profile: path && profileUseOf(path) === false ? undefined : globals.profile,
    program,
    project:
      path && projectUseOf(path) !== undefined ? undefined : globals.project,
  };
};

const print = (text: string): Outcome => ({ kind: "print", text });

const ran = (input: {
  client: Client;
  exitCode: number;
  path: CommandPath;
}): Outcome => ({
  exitCode: input.exitCode,
  interactive: input.client.prompts.interactive,
  kind: "ran",
  updateNotice: input.path.every((spec) => spec.updateNotice !== false),
});

/** Every command by name and alias, hidden ones included. */
const indexCommands = (program: Program): ReadonlyMap<string, Command> =>
  new Map(
    [...program.sections.flatMap((s) => s.commands), ...program.hidden].flatMap(
      (command) => namesOf(command.spec).map((word) => [word, command] as const)
    )
  );

/** "ls", "ls or rm", "ls, add, use or rm". */
const orList = (words: readonly string[]): string => {
  const last = words.at(-1) ?? "";
  const rest = words.slice(0, -1);
  return rest.length === 0 ? last : `${rest.join(", ")} or ${last}`;
};

/** Derived from the spec, so it matches today's "Use ls." and "Use ls, add, use or rm." */
const unknownSubcommand = (group: Group, word: string): CliError =>
  usageError(
    `unknown subcommand "${group.spec.name} ${word}"`,
    `Use ${orList(group.spec.subcommands.map((sub) => sub.name))}.`,
    "unknown_command"
  );

/**
 * Finds a group's subcommand: the first word after the group's name that
 * isn't a global option or a global option's value.
 *
 * - `server ls`, `server -P x ls`, `servers list`: ls, with the words
 *   around the subcommand's name, so ls parses `-P x` as a global option.
 *   Help names the group and the subcommand: `nipa server ls --help`.
 * - `server`, `server --json`, `server --help`: the default subcommand,
 *   with every word. Help shows the group's page: the user named only the
 *   group.
 * - `server nope`: unknown, which run() reports.
 */
const pickSubcommand = (group: Group, words: readonly string[]): Resolved => {
  const { rest } = takeGlobals({ unknown: "stop", words });
  const [next] = rest;
  if (next === undefined || next.startsWith("-")) {
    return { kind: "leaf", leaf: group.fallback, path: [group.spec], words };
  }
  const leaf = group.subcommands.get(next);
  if (!leaf) {
    return { group, kind: "unknown", word: next };
  }
  return {
    kind: "leaf",
    leaf,
    path: [group.spec, leaf.spec],
    words: words.toSpliced(words.length - rest.length, 1),
  };
};

const editDistance = (a: string, b: string): number => {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
};

/**
 * Suggests the closest command that help lists. A person who asked for help
 * (`nipa help logot`, `nipa logot --help`) is told to read that command's
 * help, never to run the command: pasting `nipa logout` would revoke the
 * session.
 */
const unknownCommand = (input: {
  help: boolean;
  program: ProgramSpec;
  word: string;
}): CliError => {
  const [closest] = input.program.sections
    .flatMap((s) => s.commands)
    .map((c) => ({ name: c.name, score: editDistance(input.word, c.name) }))
    .toSorted((a, b) => a.score - b.score);
  const verb = input.help ? "help " : "";
  const hint =
    // A short word is near every short command, so `5` or `-v` suggests nothing.
    closest && closest.score <= Math.min(2, Math.floor(input.word.length / 2))
      ? `Did you mean \`nipa ${verb}${closest.name}\`?`
      : "Run `nipa --help` to see the commands.";
  return new CliError(`unknown command "${input.word}"`, {
    exitCode: 2,
    hint,
    reason: "unknown_command",
  });
};

interface HelpWords {
  readonly globals: GlobalValues;
  readonly names: readonly string[];
}

/**
 * What follows `nipa help`: the global options among the leading options
 * (`help -P staging logot`), which a hint repeats, and the words that name
 * a page. Options before the first name are skipped, known or not:
 * `help --json server`, `help -P x server`, `help --bogus server` and
 * `help -y server stop` all name the server page. A word after an unknown
 * option belongs to the page path, since nipa can't know whether that
 * option takes a value. Options after a name end the path, and a `--` ends
 * the options: what follows it is a name even when it starts with a dash.
 * Between and after the names, global options are skipped as on a command
 * line (`help server -P x stop` names the stop page) and kept for the
 * scope; any other option ends the path.
 */
const helpWords = (words: readonly string[]): HelpWords => {
  const taken: GlobalValues[] = [];
  let rest = words;
  for (;;) {
    const front = takeGlobals({ unknown: "stop", words: rest });
    taken.push(front.globals);
    ({ rest } = front);
    const [word] = rest;
    if (word === "--") {
      return { globals: Object.assign({}, ...taken), names: rest.slice(1) };
    }
    if (word === undefined || word === "-" || !word.startsWith("-")) {
      break;
    }
    rest = rest.slice(1);
  }
  const names: string[] = [];
  for (
    let [word] = rest;
    word !== undefined && !word.startsWith("-");
    [word] = rest
  ) {
    names.push(word);
    const after = takeGlobals({ unknown: "stop", words: rest.slice(1) });
    taken.push(after.globals);
    ({ rest } = after);
  }
  return { globals: Object.assign({}, ...taken), names };
};

/**
 * The page `nipa help <words>` names: `nipa help server ls` names the ls
 * page, `nipa help server` the group's, and no word the main page (undefined).
 * Words that name nothing are the same errors a command line gets, so a
 * typo never shows another page. Names after the first one that names a
 * leaf, and options after the names, are ignored, as `nipa whoami nope
 * --help` ignores `nope`. The `-P` and `-p` among the words go into the
 * run's scope before an error, so `nipa help -P staging logot` suggests
 * what `nipa -P staging help logot` does.
 */
const helpPath = (input: {
  globals: GlobalValues;
  program: ProgramSpec;
  table: ReadonlyMap<string, Command>;
  words: readonly string[];
}): CommandPath | undefined => {
  const { program, table } = input;
  const { globals, names } = helpWords(input.words);
  setRunScope(scopeOf({ globals: { ...input.globals, ...globals }, program }));
  const [first, second] = names;
  // `help` is the word that asks for a page, not a command with one of its
  // own, so `nipa help help` is the main page.
  if (first === undefined || first === "help") {
    return undefined;
  }
  const command = table.get(first);
  if (!command) {
    throw unknownCommand({ help: true, program, word: first });
  }
  if (command.kind !== "group" || second === undefined) {
    return [command.spec];
  }
  const leaf = command.subcommands.get(second);
  if (!leaf) {
    throw unknownSubcommand(command, second);
  }
  return [command.spec, leaf.spec];
};

/**
 * True when a --version before the command prints the version. Help wins
 * over it, before the command or after it: `nipa -v whoami --help` shows the
 * page. The words after a passthrough command belong to its program, so
 * `nipa -v os --help` prints the version.
 */
const printsFrontVersion = ({
  front,
  table,
}: {
  front: ReturnType<typeof takeGlobals>;
  table: ReadonlyMap<string, Command>;
}): boolean => {
  if (!front.globals.version || front.globals.help) {
    return false;
  }
  const [word, ...after] = front.rest;
  return table.get(word ?? "")?.kind === "passthrough" || !asksForHelp(after);
};

/**
 * Runs the command argv names. Throws CliError for usage errors, which
 * src/index.ts prints with exit code 2, and lets handler errors through.
 * Sets the JSON mode of ui.ts, which src/index.ts reads to print a failure.
 *
 *   nipa -P staging server ls --json
 *        └ globals ┘ │      │  └ ls's flags plus the globals: ls.prepare
 *                    │      └ pickSubcommand, skipping globals
 *                    └ the table, by name or alias
 */
export const run = async (input: RunInput): Promise<Outcome> => {
  // Before anything can fail, so a failure to read the line has a mode too.
  setJsonMode(asksForJson(input.argv));
  setRunScope(undefined);
  const spec = programSpec(input.program);
  const table = indexCommands(input.program);
  const front = takeGlobals({ unknown: "reject", words: input.argv });
  setRunScope(scopeOf({ globals: front.globals, program: spec }));
  // Help wins over the version, so `nipa --version --help` shows the page.
  if (printsFrontVersion({ front, table })) {
    return print(input.version);
  }
  const [word, ...after] = front.rest;
  if (word === undefined) {
    return print(mainHelp({ program: spec, version: input.version }));
  }
  if (word === "help") {
    const path = helpPath({
      globals: front.globals,
      program: spec,
      table,
      words: after,
    });
    return print(
      path
        ? commandHelp(path)
        : mainHelp({ program: spec, version: input.version })
    );
  }
  const command = table.get(word);
  if (!command) {
    setRunScope(
      scopeOf({
        globals: {
          ...front.globals,
          profile: front.globals.profile ?? profileAmong(after),
          project: front.globals.project ?? projectAmong(after),
        },
        program: spec,
      })
    );
    throw unknownCommand({
      help: front.globals.help === true || asksForHelp(after),
      program: spec,
      word,
    });
  }
  if (command.kind === "passthrough") {
    // `nipa --help os` shows nipa's page. `nipa os --help` goes to openstack.
    if (front.globals.help) {
      return print(commandHelp([command.spec]));
    }
    // The words after a passthrough command belong to its program, and so
    // does a `--json` among them.
    setJsonMode(false);
    setRunScope(
      scopeOf({ globals: front.globals, path: [command.spec], program: spec })
    );
    const client = input.createClient({
      globals: front.globals,
      json: false,
      program: spec,
    });
    return ran({
      client,
      exitCode: await command.run({ client, words: after }),
      path: [command.spec],
    });
  }
  const resolved: Resolved =
    command.kind === "group"
      ? pickSubcommand(command, after)
      : { kind: "leaf", leaf: command, path: [command.spec], words: after };
  // A word that names no subcommand fails even with --help: a page for
  // `nipa server nope --help` would be some other command's.
  if (resolved.kind === "unknown") {
    throw unknownSubcommand(resolved.group, resolved.word);
  }
  // Help wins over any other word after the command and over --version.
  if (front.globals.help || asksForHelp(after)) {
    return print(commandHelp(resolved.path));
  }
  // `nipa whoami --version` and `nipa server stop web extra -v` print the
  // version, whatever else is on the line, before the command's own
  // argument checks, a client or a request.
  if (asksForVersion(after)) {
    return print(input.version);
  }
  const prepared = resolved.leaf.prepare({
    path: resolved.path,
    words: resolved.words,
  });
  const globals = { ...front.globals, ...prepared.globals };
  setRunScope(scopeOf({ globals, path: resolved.path, program: spec }));
  if (globals.project !== undefined && projectUseOf(resolved.path) === false) {
    throw usageError(
      `--project doesn't apply to ${commandLine(resolved.path)}`,
      `Usage: ${usageLine(resolved.path)}`
    );
  }
  const client = input.createClient({
    globals,
    json: asksForJson(resolved.words),
    program: spec,
  });
  return ran({
    client,
    exitCode: await prepared.run(client),
    path: resolved.path,
  });
};

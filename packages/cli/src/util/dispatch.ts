// The one dispatcher. It walks the words through the table: global options,
// then the command, then for a group the subcommand, then the leaf's own
// words. It handles help, the version and the global options the same way
// for every command, so no command folder writes a dispatch switch or a
// help check.

import type { GlobalValues } from "./arg-common";
import type { Client } from "./client";
import { programSpec } from "./command";
import type { Command, Group, Leaf, Program } from "./command";
import { commandHelp, mainHelp } from "./help";
import { asksForHelp, takeGlobals } from "./parse";
import { namesOf } from "./spec";
import type { CommandPath, ProgramSpec } from "./spec";
import { CliError, usageError } from "./ui";

/** What a run ended with. src/index.ts prints, sets the exit code and shows the update notice. */
export type Outcome =
  /** Help or the version, for stdout. Exit 0. */
  | { readonly kind: "print"; readonly text: string }
  /** A handler ran. `updateNotice` is false when a spec on its path says so. */
  | {
      readonly exitCode: number;
      readonly kind: "ran";
      readonly updateNotice: boolean;
    };

export interface RunInput {
  /** process.argv.slice(2). */
  readonly argv: readonly string[];
  /** Makes the run's client once every global option is known. Tests can pass a fake. */
  readonly createClient: (input: {
    globals: GlobalValues;
    program: ProgramSpec;
  }) => Client;
  readonly program: Program;
  readonly version: string;
}

/**
 * What the words after a command name: a leaf to run, with the path help
 * and usage lines name and the leaf's words, or a word that names none of
 * a group's subcommands. It's an error only when help wasn't asked for.
 */
type Resolved =
  | {
      readonly kind: "leaf";
      readonly leaf: Leaf;
      readonly path: CommandPath;
      readonly words: readonly string[];
    }
  | { readonly kind: "unknown"; readonly group: Group; readonly word: string };

const print = (text: string): Outcome => ({ kind: "print", text });

const ran = (exitCode: number, path: CommandPath): Outcome => ({
  exitCode,
  kind: "ran",
  updateNotice: path.every((spec) => spec.updateNotice !== false),
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
    `Use ${orList(group.spec.subcommands.map((sub) => sub.name))}.`
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
 * - `server nope`: unknown, which run() reports unless help was asked for.
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

/** `nipa help server ls` names the ls page. `nipa help nope` gets the main page. */
const helpPath = (
  table: ReadonlyMap<string, Command>,
  words: readonly string[]
): CommandPath | undefined => {
  const [first, second] = words;
  const command = first === undefined ? undefined : table.get(first);
  if (!command) {
    return undefined;
  }
  const leaf =
    command.kind === "group" && second !== undefined
      ? command.subcommands.get(second)
      : undefined;
  return command.kind === "group" && leaf
    ? [command.spec, leaf.spec]
    : [command.spec];
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

/** Suggests the closest command that help lists. */
const unknownCommand = (input: {
  program: ProgramSpec;
  word: string;
}): CliError => {
  const [closest] = input.program.sections
    .flatMap((s) => s.commands)
    .map((c) => ({ name: c.name, score: editDistance(input.word, c.name) }))
    .toSorted((a, b) => a.score - b.score);
  const hint =
    closest && closest.score <= 2
      ? `Did you mean \`nipa ${closest.name}\`?`
      : "Run `nipa --help` to see the commands.";
  return new CliError(`unknown command "${input.word}"`, {
    exitCode: 2,
    hint,
  });
};

/**
 * Runs the command argv names. Throws CliError for usage errors, which
 * src/index.ts prints with exit code 2, and lets handler errors through.
 *
 *   nipa -P staging server ls --json
 *        └ globals ┘ │      │  └ ls's flags plus the globals: ls.prepare
 *                    │      └ pickSubcommand, skipping globals
 *                    └ the table, by name or alias
 */
export const run = async (input: RunInput): Promise<Outcome> => {
  const spec = programSpec(input.program);
  const table = indexCommands(input.program);
  const front = takeGlobals({ unknown: "reject", words: input.argv });
  if (front.globals.version) {
    return print(input.version);
  }
  const [word, ...after] = front.rest;
  if (word === undefined) {
    return print(mainHelp({ program: spec, version: input.version }));
  }
  if (word === "help") {
    const path = helpPath(table, after);
    return print(
      path
        ? commandHelp(path)
        : mainHelp({ program: spec, version: input.version })
    );
  }
  const command = table.get(word);
  if (!command) {
    throw unknownCommand({ program: spec, word });
  }
  if (command.kind === "passthrough") {
    // `nipa --help os` shows nipa's page. `nipa os --help` goes to openstack.
    if (front.globals.help) {
      return print(commandHelp([command.spec]));
    }
    const client = input.createClient({
      globals: front.globals,
      program: spec,
    });
    return ran(await command.run({ client, words: after }), [command.spec]);
  }
  const resolved: Resolved =
    command.kind === "group"
      ? pickSubcommand(command, after)
      : { kind: "leaf", leaf: command, path: [command.spec], words: after };
  // Help wins over any other word after the command:
  // `nipa server nope --help` shows the server page.
  if (front.globals.help || asksForHelp(after)) {
    return print(
      commandHelp(resolved.kind === "leaf" ? resolved.path : [command.spec])
    );
  }
  if (resolved.kind === "unknown") {
    throw unknownSubcommand(resolved.group, resolved.word);
  }
  const prepared = resolved.leaf.prepare({
    path: resolved.path,
    words: resolved.words,
  });
  const globals = { ...front.globals, ...prepared.globals };
  const client = input.createClient({ globals, program: spec });
  return ran(await prepared.run(client), resolved.path);
};

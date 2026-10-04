// What a command folder uses. command.ts declares the specs with
// defineCommand, defineGroup and definePassthrough. The handler files bind
// them to code with handle, route and forward. The bound commands go into
// the table in src/commands/index.ts. Parsing, dispatch, usage errors, help
// and completion all come from the specs, so a folder writes no parsing,
// no dispatch switch and no help handling.

import { usageError } from "../lib/ui";
import type { GlobalValues } from "./arg-common";
import type { Client } from "./client";
import { usageLine } from "./help";
import { parseLeaf } from "./parse";
import { namesOf } from "./spec";
import type {
  CommandPath,
  CommandSpec,
  Described,
  Example,
  GroupSpec,
  Input,
  LeafInput,
  LeafSpec,
  PassthroughSpec,
  ProgramSpec,
  Target,
} from "./spec";

// Handlers that name the client's type, such as a helper taking it, import
// it from here: command folders don't import util/client.
export type { Client } from "./client";

// Declaring. Each returns its argument with `kind` added and every literal
// kept, so names, flags and choices type the handler.

/** Rejects keys T doesn't know, which a captured literal would otherwise let through. */
type Exact<S, T> = S & Record<Exclude<keyof S, keyof T>, never>;

/**
 * A command that runs: top-level, such as `whoami`, or a group's
 * subcommand, such as `server ls`. Write `args: []` and `flags: []` when it
 * has none.
 */
export const defineCommand = <const S extends LeafInput>(
  spec: Exact<S, LeafInput>
): S & { readonly kind: "leaf" } => ({ ...spec, kind: "leaf" });

/**
 * A noun with subcommands. The compiler checks that `default` names one of
 * them, and flags a misspelled key. Only the subcommands keep their literal
 * types: they type the handler table in the folder's index.ts.
 */
export const defineGroup = <
  const Subs extends readonly [LeafSpec, ...LeafSpec[]],
>(
  spec: Described & {
    readonly default: NoInfer<Subs[number]["name"]>;
    readonly subcommands: Subs;
  }
): Described & {
  readonly default: Subs[number]["name"];
  readonly kind: "group";
  readonly subcommands: Subs;
} => ({ ...spec, kind: "group" });

/** A command that hands its words to another program, untouched. */
export const definePassthrough = <
  const S extends Described & { readonly target: Target },
>(
  spec: Exact<S, Described & { readonly target: Target }>
): S & { readonly kind: "passthrough" } => ({ ...spec, kind: "passthrough" });

// Binding.

/** What a leaf's handler gets: its parsed `args` and `flags`, and the client. */
export interface LeafContext<S extends LeafSpec> extends Input<S> {
  readonly client: Client;
}

/** Returns the exit code. Throw a CliError to fail with a message and a hint. */
export type LeafHandler<S extends LeafSpec> = (
  context: LeafContext<S>
) => Promise<number>;

/** A leaf's words, parsed, waiting for the client the dispatcher makes from the globals. */
export interface Prepared {
  readonly globals: GlobalValues;
  readonly run: (client: Client) => Promise<number>;
}

export interface Leaf<S extends LeafSpec = LeafSpec> {
  readonly kind: "leaf";
  readonly spec: S;
  /**
   * Parses the words after the command's name. `path` names the command,
   * ending with this leaf's spec, for the hints in usage errors.
   */
  readonly prepare: (input: {
    path: CommandPath;
    words: readonly string[];
  }) => Prepared;
}

/** Binds a leaf's spec to its handler. The handler's `args` and `flags` are typed from the spec. */
export const handle = <S extends LeafSpec>(
  spec: S,
  handler: LeafHandler<S>
): Leaf<S> => ({
  kind: "leaf",
  prepare: ({ path, words }) => {
    const parsed = parseLeaf({ path, spec, words });
    return {
      globals: parsed.globals,
      run: (client) => handler({ ...parsed.input, client }),
    };
  },
  spec,
});

type SubcommandNamed<G extends GroupSpec, N> = Extract<
  G["subcommands"][number],
  { readonly name: N }
>;

/**
 * A group's handlers, keyed by subcommand name. A missing key, an extra key,
 * or a handler bound to another spec doesn't compile, so the handler table
 * can't drift from command.ts.
 */
export type GroupHandlers<G extends GroupSpec> = {
  readonly [N in G["subcommands"][number]["name"]]: Leaf<SubcommandNamed<G, N>>;
};

export interface Group {
  readonly kind: "group";
  readonly spec: GroupSpec;
  /** Each subcommand by name and by alias. */
  readonly subcommands: ReadonlyMap<string, Leaf>;
  /** The default subcommand, for `nipa server` and `nipa server --json`. */
  readonly fallback: Leaf;
}

/** Binds a group's spec to one handler per subcommand. */
export const route = <G extends GroupSpec>(
  spec: G & { readonly default: keyof GroupHandlers<G> },
  handlers: GroupHandlers<G>
): Group => {
  const leaves = Object.values<Leaf>(handlers);
  const subcommands = new Map(
    leaves.flatMap((leaf) =>
      namesOf(leaf.spec).map((word) => [word, leaf] as const)
    )
  );
  return { fallback: handlers[spec.default], kind: "group", spec, subcommands };
};

/** What a passthrough's handler gets. */
export interface PassthroughContext {
  /** The words after the program, untouched, `--help` included. */
  readonly args: readonly string[];
  readonly client: Client;
  /** The program to run: the target's, or the first word for `exec`. */
  readonly command: string;
}

export type PassthroughHandler = (
  context: PassthroughContext
) => Promise<number>;

export interface Passthrough {
  readonly kind: "passthrough";
  readonly spec: PassthroughSpec;
  /** Runs with every word after the command's name. nipa reads none of them. */
  readonly run: (input: {
    client: Client;
    words: readonly string[];
  }) => Promise<number>;
}

/** The program a passthrough runs, and its words. */
type Invocation = Pick<PassthroughContext, "args" | "command">;

/** Derived from the spec's target, so `os` names openstack once. */
const resolveTarget = (
  spec: PassthroughSpec,
  words: readonly string[]
): Invocation => {
  const { target } = spec;
  switch (target.kind) {
    case "program": {
      return { args: words, command: target.program };
    }
    case "openstack": {
      return { args: words, command: "openstack" };
    }
    case "command": {
      const [command, ...args] = words;
      if (command === undefined) {
        throw usageError("missing <command>", `Usage: ${usageLine([spec])}`);
      }
      return { args, command };
    }
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
};

/** Binds a passthrough's spec to the code that runs the program. */
export const forward = (
  spec: PassthroughSpec,
  handler: PassthroughHandler
): Passthrough => ({
  kind: "passthrough",
  run: ({ client, words }) =>
    handler({ ...resolveTarget(spec, words), client }),
  spec,
});

// The table.

export type Command = Leaf | Group | Passthrough;

export interface Section {
  readonly commands: readonly Command[];
  readonly title: string;
}

/** Every command. src/commands/index.ts is the one place that lists them. */
export interface Program {
  readonly examples: readonly Example[];
  /** Commands nipa runs but leaves out of help, completion and suggestions. */
  readonly hidden: readonly Command[];
  /** The main help's groups, in order. */
  readonly sections: readonly Section[];
  readonly summary: string;
}

const specOf = (command: Command): CommandSpec => command.spec;

/** The specs alone, for help, completion and `client.program`. */
export const programSpec = (program: Program): ProgramSpec => ({
  examples: program.examples,
  hidden: program.hidden.map(specOf),
  sections: program.sections.map((section) => ({
    commands: section.commands.map(specOf),
    title: section.title,
  })),
  summary: program.summary,
});

// The command model. Each command is declared once, as plain data, in its
// folder's command.ts. Parsing, dispatch, usage errors, help pages and the
// four completion scripts all read these specs. Nothing else lists a
// command's flags, arguments, subcommands or aliases.

/** The words a value may be. Never empty. */
export type Choices = readonly [string, ...string[]];

/**
 * The resources a Tab press can name, by the word `nipa __complete` takes.
 * The completion scripts ship these words, so they only ever grow.
 */
export const RESOURCE_KINDS = [
  "servers",
  "flavors",
  "images",
  "networks",
  "volumes",
  "security-groups",
  "load-balancers",
  "databases",
] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/** What a flag takes after it. */
export type FlagValue =
  | { readonly kind: "none" }
  /** Free text. Help shows `<name>`. */
  | { readonly kind: "text"; readonly name: string }
  /** One of `choices`. The handler gets their union, so it never re-checks. */
  | { readonly kind: "choice"; readonly choices: Choices }
  /** A project name or ID. Completes from the session. */
  | { readonly kind: "project" }
  /** A profile name. Completes from the config. */
  | { readonly kind: "profile" };

export interface FlagSpec {
  readonly description: string;
  /** `json` for `--json`. Also the flag's key in the handler's `flags`. */
  readonly long: string;
  readonly short?: string;
  readonly value: FlagValue;
}

/** What a positional argument takes. Help shows the argument's own name. */
export type ArgValue =
  | { readonly kind: "text" }
  | { readonly kind: "choice"; readonly choices: Choices }
  | { readonly kind: "project" }
  | { readonly kind: "profile" }
  /** A resource name. Completes from the Space API. */
  | { readonly kind: "resource"; readonly resource: ResourceKind };

export interface ArgSpec {
  /**
   * `one` must be given, `optional` may be left out, `rest` takes every word
   * left, zero or more. A command lists its ones first, then its optionals,
   * then at most one rest. test/unit/commands/index.test.ts checks the order.
   */
  readonly arity: "one" | "optional" | "rest";
  /** `name` for `<name>`. Also the argument's key in the handler's `args`. */
  readonly name: string;
  readonly value: ArgValue;
}

export interface Example {
  readonly command: string;
  readonly description: string;
}

/** What every command has, whatever it does with its words. */
export interface Described {
  readonly aliases?: readonly string[];
  /** The help page's paragraph. Help uses `summary` when it's missing. */
  readonly description?: string;
  readonly examples?: readonly Example[];
  readonly name: string;
  /** One line, for the command lists in help and completion. */
  readonly summary: string;
  /**
   * `false` when a shell reads the output, as with `completion`, so nipa
   * skips the update notice. A group's setting covers its subcommands.
   */
  readonly updateNotice?: false;
}

/** What a contributor writes for a command that runs: see `defineCommand`. */
export interface LeafInput extends Described {
  /** Positional arguments, in order. `[]` when there are none. */
  readonly args: readonly ArgSpec[];
  /** The command's own flags. The global options come on top. `[]` when there are none. */
  readonly flags: readonly FlagSpec[];
}

/** A command that runs a handler with parsed, typed `args` and `flags`. */
export interface LeafSpec extends LeafInput {
  readonly kind: "leaf";
}

/** A noun whose first word picks a subcommand, as in `nipa server ls`. */
export interface GroupSpec extends Described {
  /** The subcommand that runs when the group's name comes alone, as in `nipa server`. */
  readonly default: string;
  readonly kind: "group";
  readonly subcommands: readonly [LeafSpec, ...LeafSpec[]];
}

/** Where a passthrough command sends the words after its name. */
export type Target =
  /** `nipa tf plan` runs `terraform plan`. Completion continues as terraform's. */
  | { readonly kind: "program"; readonly program: string }
  /** `nipa os server list` runs `openstack server list`. Completion asks `nipa __complete openstack`. */
  | { readonly kind: "openstack" }
  /** `nipa exec cmd args` runs `cmd args`. Completion continues as cmd's. */
  | { readonly kind: "command" };

/** A command whose words belong to another program, `--help` included. nipa never parses them. */
export interface PassthroughSpec extends Described {
  readonly kind: "passthrough";
  readonly target: Target;
}

export type CommandSpec = LeafSpec | GroupSpec | PassthroughSpec;

/** The command the user named: a top-level command, or a group and one of its subcommands. */
export type CommandPath =
  | readonly [CommandSpec]
  | readonly [GroupSpec, LeafSpec];

export interface SectionSpec {
  readonly commands: readonly CommandSpec[];
  readonly title: string;
}

/** Every command, as help and completion see them. */
export interface ProgramSpec {
  readonly examples: readonly Example[];
  /** Commands nipa runs but leaves out of help, completion and suggestions. */
  readonly hidden: readonly CommandSpec[];
  /** The main help's groups, in order. Completion lists commands in the same order. */
  readonly sections: readonly SectionSpec[];
  readonly summary: string;
}

type ValueType<V> = V extends {
  readonly kind: "choice";
  readonly choices: readonly (infer C)[];
}
  ? C
  : string;

/**
 * The handler's `flags`, derived from the spec: a key per flag, `true` for a
 * flag without a value, the choices' union for a choice. A flag that wasn't
 * given is absent, so `flags.use ?? ask()` can tell "not given" from "given".
 */
export type FlagValues<L extends readonly FlagSpec[]> = {
  readonly [F in L[number] as F["long"]]?: F["value"] extends {
    readonly kind: "none";
  }
    ? true
    : ValueType<F["value"]>;
};

/** The handler's `args`, derived from the spec: a key per argument. */
export type ArgValues<L extends readonly ArgSpec[]> = {
  readonly [A in L[number] as A["name"]]: A["arity"] extends "one"
    ? ValueType<A["value"]>
    : A["arity"] extends "optional"
      ? ValueType<A["value"]> | undefined
      : readonly ValueType<A["value"]>[];
};

/** What parsing a leaf's words gives its handler. */
export interface Input<S extends LeafSpec> {
  readonly args: ArgValues<S["args"]>;
  readonly flags: FlagValues<S["flags"]>;
}

export const namesOf = (spec: Described): readonly string[] => [
  spec.name,
  ...(spec.aliases ?? []),
];

export const flagWords = (flag: FlagSpec): readonly string[] =>
  flag.short ? [`--${flag.long}`, `-${flag.short}`] : [`--${flag.long}`];

export const flagPlaceholder = (value: FlagValue): string => {
  switch (value.kind) {
    case "none": {
      return "";
    }
    case "text": {
      return ` <${value.name}>`;
    }
    case "choice": {
      return ` <${value.choices.join("|")}>`;
    }
    case "project": {
      return " <project>";
    }
    case "profile": {
      return " <name>";
    }
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
};

/** The path's last command: the one a help page or usage line is about. */
export const subjectOf = (path: CommandPath): CommandSpec =>
  path.length === 1 ? path[0] : path[1];

/** The commands help and completion list, in section order. */
export const visibleCommands = (program: ProgramSpec): readonly CommandSpec[] =>
  program.sections.flatMap((section) => section.commands);

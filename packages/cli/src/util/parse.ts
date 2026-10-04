import { usageError } from "../lib/ui";
import { GLOBAL_FLAGS, helpFlag } from "./arg-common";
import type { GlobalValues } from "./arg-common";
import { commandLine, usageLine } from "./help";
import { flagPlaceholder, flagWords } from "./spec";
import type {
  ArgSpec,
  ArgValues,
  CommandPath,
  FlagSpec,
  FlagValues,
  Input,
  LeafSpec,
} from "./spec";

type RawFlags = ReadonlyMap<string, string | true>;
interface Front {
  readonly globals: GlobalValues;
  readonly rest: readonly string[];
}
interface Parsed<S extends LeafSpec> {
  readonly globals: GlobalValues;
  readonly input: Input<S>;
}
interface Hints {
  readonly command: string;
  readonly usage: string;
}
interface Tokens {
  readonly own: RawFlags;
  readonly globals: RawFlags;
  readonly positionals: readonly string[];
}
type Index = ReadonlyMap<string, FlagSpec>;
interface Option {
  readonly flag: FlagSpec;
  readonly value: string | true;
}
interface Consumed {
  readonly options: readonly Option[];
  readonly used: number;
}

const indexFlags = (flags: readonly FlagSpec[]): Index =>
  new Map(
    flags.flatMap((flag) =>
      flagWords(flag).map((word) => [word, flag] as const)
    )
  );

const useOneOf = (choices: readonly string[]) =>
  `Use one of: ${choices.join(", ")}.`;

const checked = (flag: FlagSpec, value: string): string => {
  if (flag.value.kind === "choice" && !flag.value.choices.includes(value)) {
    throw usageError(
      `unknown ${flag.long} "${value}"`,
      useOneOf(flag.value.choices)
    );
  }
  return value;
};

const needed = (input: {
  flag: FlagSpec;
  hints: Hints;
  name: string;
  next: string | undefined;
}): string => {
  const { flag, hints, name, next } = input;
  if (next === undefined || next.startsWith("-")) {
    throw usageError(
      `${name} needs${flagPlaceholder(flag.value)}`,
      `Usage: ${hints.usage}`
    );
  }
  return checked(flag, next);
};

const readOption = (input: {
  hints: Hints;
  index: Index;
  next: string | undefined;
  word: string;
}): Consumed | undefined => {
  const { hints, index, next, word } = input;
  if (word.startsWith("--")) {
    const eq = word.indexOf("=");
    const name = eq === -1 ? word : word.slice(0, eq);
    const flag = index.get(name);
    if (!flag) {
      return undefined;
    }
    if (flag.value.kind === "none") {
      if (eq !== -1) {
        throw usageError(
          `${name} doesn't take a value`,
          `Usage: ${hints.usage}`
        );
      }
      return { options: [{ flag, value: true }], used: 1 };
    }
    if (eq !== -1) {
      return {
        options: [{ flag, value: checked(flag, word.slice(eq + 1)) }],
        used: 1,
      };
    }
    return {
      options: [{ flag, value: needed({ flag, hints, name, next }) }],
      used: 2,
    };
  }
  const letters = [...word].slice(1);
  const flags = letters.map((letter) => index.get(`-${letter}`));
  const known = flags.filter((flag) => flag !== undefined);
  if (known.length !== letters.length) {
    return undefined;
  }
  const options: Option[] = [];
  let used = 1;
  for (const [i, flag] of known.entries()) {
    if (flag.value.kind === "none") {
      options.push({ flag, value: true });
    } else if (i === known.length - 1) {
      options.push({
        flag,
        value: needed({ flag, hints, name: `-${letters[i]}`, next }),
      });
      used = 2;
    } else {
      throw usageError(
        `-${letters[i]} needs${flagPlaceholder(flag.value)}`,
        `Usage: ${hints.usage}`
      );
    }
  }
  return { options, used };
};

const flagValues = <L extends readonly FlagSpec[]>(
  flags: L,
  raw: RawFlags
): FlagValues<L> => {
  const given = flags.flatMap((flag) => {
    const value = raw.get(flag.long);
    return value === undefined ? [] : [[flag.long, value] as const];
  });
  // SAFETY: given holds only flags from L, each value checked against its spec by tokenize.
  return Object.fromEntries(given) as FlagValues<L>;
};

const GLOBAL_HINTS: Hints = {
  command: "nipa",
  usage: "nipa [options] <command>",
};

const GLOBAL_INDEX = indexFlags(GLOBAL_FLAGS);

type Unknown = "reject" | "stop";

/** The global option at `words[at]`, or undefined where the options end. */
const readGlobal = (input: {
  at: number;
  unknown: Unknown;
  words: readonly string[];
}): Consumed | undefined => {
  const { at, words } = input;
  const word = words[at];
  if (
    word === undefined ||
    word === "--" ||
    word === "-" ||
    !word.startsWith("-")
  ) {
    return undefined;
  }
  const read = readOption({
    hints: GLOBAL_HINTS,
    index: GLOBAL_INDEX,
    next: words[at + 1],
    word,
  });
  if (!read && input.unknown === "reject") {
    throw usageError(
      `unknown option "${word}"`,
      "Run `nipa --help` to see the options."
    );
  }
  return read;
};

/**
 * Reads the global options at the start of `words`, up to the first word
 * that isn't one. `stop` leaves an unknown option for the command to read.
 */
export const takeGlobals = (input: {
  unknown: Unknown;
  words: readonly string[];
}): Front => {
  const { unknown, words } = input;
  const raw = new Map<string, string | true>();
  let at = 0;
  for (
    let read = readGlobal({ at, unknown, words });
    read !== undefined;
    read = readGlobal({ at, unknown, words })
  ) {
    for (const { flag, value } of read.options) {
      raw.set(flag.long, value);
    }
    at += read.used;
  }
  return { globals: flagValues(GLOBAL_FLAGS, raw), rest: words.slice(at) };
};

export const asksForHelp = (words: readonly string[]): boolean => {
  const end = words.indexOf("--");
  const options = end === -1 ? words : words.slice(0, end);
  const spellings = new Set(flagWords(helpFlag));
  return options.some((word) => spellings.has(word));
};

const tokenize = (input: {
  flags: readonly FlagSpec[];
  hints: Hints;
  words: readonly string[];
}): Tokens => {
  const { flags, hints, words } = input;
  const index = indexFlags([...flags, ...GLOBAL_FLAGS]);
  const ownNames = new Set(flags.map((flag) => flag.long));
  const own = new Map<string, string | true>();
  const globals = new Map<string, string | true>();
  const positionals: string[] = [];
  let i = 0;
  while (i < words.length) {
    const word = words[i] ?? "";
    if (word === "--") {
      positionals.push(...words.slice(i + 1));
      break;
    }
    if (word.startsWith("-") && word !== "-") {
      const read = readOption({ hints, index, next: words[i + 1], word });
      if (!read) {
        throw usageError(
          `unknown option "${word}"`,
          `Run \`${hints.command} --help\` to see the options.`
        );
      }
      for (const { flag, value } of read.options) {
        (ownNames.has(flag.long) ? own : globals).set(flag.long, value);
      }
      i += read.used;
    } else {
      positionals.push(word);
      i += 1;
    }
  }
  return { globals, own, positionals };
};

const checkArg = (arg: ArgSpec, word: string): string => {
  if (arg.value.kind === "choice" && !arg.value.choices.includes(word)) {
    throw usageError(
      `unknown ${arg.name} "${word}"`,
      useOneOf(arg.value.choices)
    );
  }
  return word;
};

const argValues = <L extends readonly ArgSpec[]>(input: {
  args: L;
  hints: Hints;
  positionals: readonly string[];
}): ArgValues<L> => {
  const queue = [...input.positionals];
  const entries = input.args.map((arg) => {
    switch (arg.arity) {
      case "one": {
        const word = queue.shift();
        if (word === undefined) {
          throw usageError(
            `missing <${arg.name}>`,
            arg.value.kind === "choice"
              ? useOneOf(arg.value.choices)
              : `Usage: ${input.hints.usage}`
          );
        }
        return [arg.name, checkArg(arg, word)] as const;
      }
      case "optional": {
        const word = queue.shift();
        return [
          arg.name,
          word === undefined ? undefined : checkArg(arg, word),
        ] as const;
      }
      case "rest": {
        return [
          arg.name,
          queue.splice(0).map((word) => checkArg(arg, word)),
        ] as const;
      }
      default: {
        const _exhaustive: never = arg.arity;
        return _exhaustive;
      }
    }
  });
  const [extra] = queue;
  if (extra !== undefined) {
    throw usageError(
      `unexpected argument "${extra}"`,
      `Usage: ${input.hints.usage}`
    );
  }
  // SAFETY: entries has a key per spec in L, typed by its arity and value.
  return Object.fromEntries(entries) as ArgValues<L>;
};

export const parseLeaf = <S extends LeafSpec>(input: {
  path: CommandPath;
  spec: S;
  words: readonly string[];
}): Parsed<S> => {
  const { path, spec, words } = input;
  const hints = { command: commandLine(path), usage: usageLine(path) };
  const tokens = tokenize({ flags: spec.flags, hints, words });
  return {
    globals: flagValues(GLOBAL_FLAGS, tokens.globals),
    input: {
      args: argValues({
        args: spec.args,
        hints,
        positionals: tokens.positionals,
      }),
      flags: flagValues(spec.flags, tokens.own),
    },
  };
};

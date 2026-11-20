// Every example the help pages print is a line a person may copy. Each one
// parses against the current specs and teaches long options only, so a
// renamed flag fails here instead of in a user's terminal.

import { describe, expect, test } from "bun:test";

import { program } from "../../../src/commands";
import type { Command, Leaf } from "../../../src/util/command";
import { takeGlobals } from "../../../src/util/parse";
import { namesOf } from "../../../src/util/spec";
import type { CommandPath, Example } from "../../../src/util/spec";

const SHORT_OPTION = /^-[A-Za-z]+$/u;

const commands: readonly Command[] = [
  ...program.sections.flatMap((section) => section.commands),
  ...program.hidden,
];

const examples: readonly Example[] = [
  ...program.examples,
  ...commands.flatMap((command) => [
    ...(command.spec.examples ?? []),
    ...(command.kind === "group"
      ? [...command.subcommands.values()].flatMap(
          (leaf) => leaf.spec.examples ?? []
        )
      : []),
  ]),
];

/** The words of a line, splitting on spaces outside single quotes. */
const splitWords = (line: string): string[] => {
  const words: string[] = [];
  let word = "";
  let quoted = false;
  let started = false;
  for (const char of line) {
    if (char === "'") {
      quoted = !quoted;
      started = true;
    } else if (char === " " && !quoted) {
      if (started) {
        words.push(word);
      }
      word = "";
      started = false;
    } else {
      word += char;
      started = true;
    }
  }
  if (started) {
    words.push(word);
  }
  return words;
};

/** The text from `nipa ` to the `)` that closes the `$(` before it. */
const substitution = (example: string, at: number): string => {
  const start = at + 2;
  let depth = 1;
  for (let i = start; i < example.length; i += 1) {
    if (example[i] === "(") {
      depth += 1;
    } else if (example[i] === ")") {
      depth -= 1;
      if (depth === 0) {
        return example.slice(start, i);
      }
    }
  }
  throw new Error(`no closing ")" in example: ${example}`);
};

/**
 * The nipa command line inside an example: the words before the first pipe,
 * after the `nipa` of `claude mcp add nipa -- nipa mcp`, or inside the `$(…)`
 * of a shell snippet. Any other shape fails, so a new one gets a decision.
 */
const nipaLine = (example: string): string => {
  const inner = example.indexOf("$(nipa ");
  const after = example.indexOf(" -- nipa ");
  let line: string;
  if (inner !== -1) {
    line = substitution(example, inner);
  } else if (after !== -1) {
    line = example.slice(after + " -- ".length);
  } else if (example.startsWith("nipa ")) {
    line = example;
  } else {
    throw new Error(`example is not a nipa command line: ${example}`);
  }
  return line.split(" | ")[0] ?? line;
};

interface Target {
  /** The words of the line after the command's name, for `prepare`. */
  readonly leaf?: { leaf: Leaf; path: CommandPath; words: readonly string[] };
  /** Every word the line teaches an option with: all of them, or the front only. */
  readonly optionWords: readonly string[];
}

const resolve = (words: readonly string[]): Target => {
  const [nipa, ...line] = words;
  expect(nipa).toBe("nipa");
  const front = takeGlobals({ unknown: "reject", words: line });
  const [name, ...after] = front.rest;
  const command = commands.find((c) => namesOf(c.spec).includes(name ?? ""));
  if (!command) {
    throw new Error(`no command named "${name}"`);
  }
  const before = line.slice(0, line.length - front.rest.length);
  if (command.kind === "passthrough") {
    return { optionWords: before };
  }
  if (command.kind === "leaf") {
    return {
      leaf: { leaf: command, path: [command.spec], words: after },
      optionWords: [...before, ...after],
    };
  }
  const inGroup = takeGlobals({ unknown: "stop", words: after });
  const [next] = inGroup.rest;
  const names = next !== undefined && !next.startsWith("-");
  const leaf = names ? command.subcommands.get(next) : command.fallback;
  if (!leaf) {
    throw new Error(`no subcommand named "${command.spec.name} ${next}"`);
  }
  return {
    leaf: {
      leaf,
      path: [command.spec, leaf.spec],
      words: names
        ? after.toSpliced(after.length - inGroup.rest.length, 1)
        : after,
    },
    optionWords: [...before, ...after],
  };
};

describe("help examples", () => {
  test("collects the examples of every command", () => {
    expect(examples.length).toBeGreaterThan(20);
  });

  test.each(examples.map((example) => [example.command]))(
    "%s parses and uses long options",
    (example) => {
      const words = splitWords(nipaLine(example));
      const target = resolve(words);
      expect(target.optionWords.filter((w) => SHORT_OPTION.test(w))).toEqual(
        []
      );
      const { leaf } = target;
      if (leaf) {
        expect(() =>
          leaf.leaf.prepare({ path: leaf.path, words: leaf.words })
        ).not.toThrow();
      }
    }
  );
});

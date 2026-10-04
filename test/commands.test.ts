// Checks on the command table that the types can't express. Each one fails
// the build where a hand-synced list would have drifted silently.

import { describe, expect, test } from "bun:test";
import path from "node:path";

import { program } from "../src/commands";
import { GLOBAL_FLAGS } from "../src/util/arg-common";
import { programSpec } from "../src/util/command";
import { flagWords, namesOf } from "../src/util/spec";
import type { CommandSpec, LeafSpec } from "../src/util/spec";

const spec = programSpec(program);
const topLevel: readonly CommandSpec[] = [
  ...spec.sections.flatMap((section) => section.commands),
  ...spec.hidden,
];
const leaves: readonly LeafSpec[] = topLevel.flatMap((command) => {
  switch (command.kind) {
    case "leaf": {
      return [command];
    }
    case "group": {
      return command.subcommands;
    }
    case "passthrough": {
      return [];
    }
    default: {
      const _exhaustive: never = command;
      return _exhaustive;
    }
  }
});

const duplicates = (words: readonly string[]): string[] =>
  words.filter((word, index) => words.indexOf(word) !== index);

const COMMANDS = path.join(import.meta.dir, "..", "src", "commands");

/** Each file in a command's folder, and its text. */
const folderFiles = async () => {
  const files = await Array.fromAsync(new Bun.Glob("*/**/*.ts").scan(COMMANDS));
  return Promise.all(
    files.map(async (file) => ({
      file,
      text: await Bun.file(path.join(COMMANDS, file)).text(),
    }))
  );
};

const IMPORT = /from "(?<from>[^"]+)"/gu;

// The dispatcher parses, routes and prints help for every command. A command
// that imported these modules could start parsing or dispatching on its own.
const DISPATCH_INTERNALS = /\/util\/(?:client|dispatch|help|parse)$/u;

// Such as `../server/format`. Code that two commands share goes in src/lib.
const OTHER_FOLDER = /^\.\.\/[^.]/u;

describe("the command table", () => {
  test("lists every command folder", async () => {
    const files = await Array.fromAsync(
      new Bun.Glob("*/index.ts").scan(COMMANDS)
    );
    const registered = new Set<unknown>([
      ...program.sections.flatMap((section) => section.commands),
      ...program.hidden,
    ]);
    const modules = await Promise.all(
      files.map(async (file) => ({
        exports: Object.values(await import(path.join(COMMANDS, file))),
        file,
      }))
    );
    const missing = modules
      .filter((m) => !m.exports.some((value) => registered.has(value)))
      .map((m) => m.file);
    expect(missing).toEqual([]);
  });

  test("names and aliases are unique, and none is `help`", () => {
    const words = topLevel.flatMap((command) => namesOf(command));
    expect(duplicates(words)).toEqual([]);
    expect(words).not.toContain("help");
    for (const command of topLevel) {
      if (command.kind === "group") {
        const subs = command.subcommands.flatMap((sub) => namesOf(sub));
        expect(duplicates(subs)).toEqual([]);
      }
    }
  });

  test("a command's flags don't reuse a global option's spelling", () => {
    const globalWords = new Set(
      GLOBAL_FLAGS.flatMap((flag) => flagWords(flag))
    );
    for (const leaf of leaves) {
      const words = leaf.flags.flatMap((flag) => flagWords(flag));
      expect(duplicates(words)).toEqual([]);
      expect(words.filter((word) => globalWords.has(word))).toEqual([]);
    }
  });

  test("arguments come as ones, then optionals, then at most one rest", () => {
    const order = { one: 0, optional: 1, rest: 2 };
    for (const leaf of leaves) {
      const ranks = leaf.args.map((arg) => order[arg.arity]);
      expect(ranks).toEqual(ranks.toSorted());
      expect(ranks.filter((rank) => rank === order.rest).length).toBeLessThan(
        2
      );
    }
  });
});

describe("command folders", () => {
  test("don't import the dispatcher or another command's folder", async () => {
    const files = await folderFiles();
    const imports = files.flatMap(({ file, text }) =>
      [...text.matchAll(IMPORT)].map((match) => ({
        file,
        from: match.groups?.from ?? "",
      }))
    );
    const wrong = imports
      .filter(
        ({ from }) => DISPATCH_INTERNALS.test(from) || OTHER_FOLDER.test(from)
      )
      .map(({ file, from }) => `${file} imports ${from}`);
    expect(wrong).toEqual([]);
  });

  test("print results through client.stdout, not console", async () => {
    const files = await folderFiles();
    const printing = files.filter(({ text }) => text.includes("console."));
    expect(printing.map(({ file }) => file)).toEqual([]);
  });
});

// docs/cli-reference.md says it matches the code. This proves it for the
// names, aliases and flags, which are what readers grep for.

import { describe, expect, test } from "bun:test";
import path from "node:path";

import { program } from "../../../src/commands";
import { programSpec } from "../../../src/util/command";
import type { CommandSpec, LeafSpec } from "../../../src/util/spec";

const REFERENCE = path.join(
  import.meta.dir,
  "../../../../../docs/cli-reference.md"
);

const spec = programSpec(program);
const visible: readonly CommandSpec[] = spec.sections.flatMap(
  (section) => section.commands
);

const flagsOf = (leaf: LeafSpec) => leaf.flags.map((flag) => `--${flag.long}`);

/** The strings the reference must contain, as a reader would type them. */
const expected = (): string[] => {
  const words: string[] = [];
  for (const command of visible) {
    words.push(`\`nipa ${command.name}`);
    for (const alias of command.aliases ?? []) {
      words.push(`\`nipa ${alias}\``);
    }
    if (command.kind === "leaf") {
      words.push(...flagsOf(command));
    }
    if (command.kind === "group") {
      for (const sub of command.subcommands) {
        words.push(`\`nipa ${command.name} ${sub.name}`);
        for (const alias of sub.aliases ?? []) {
          words.push(`\`nipa ${command.name} ${alias}\``);
        }
        words.push(...flagsOf(sub));
      }
    }
  }
  return [...new Set(words)];
};

describe("docs/cli-reference.md", () => {
  test("names every visible command, alias and flag", async () => {
    const doc = await Bun.file(REFERENCE).text();
    const missing = expected().filter((word) => !doc.includes(word));
    expect(missing).toEqual([]);
  });
});

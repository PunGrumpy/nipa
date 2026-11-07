import { describe, expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";

import { program } from "../../../src/commands";
import { GLOBAL_FLAGS } from "../../../src/util/arg-common";
import { programSpec } from "../../../src/util/command";
import { commandHelp, mainHelp } from "../../../src/util/help";
import type { CommandPath, CommandSpec, Example } from "../../../src/util/spec";
import { visibleCommands } from "../../../src/util/spec";

const spec = programSpec(program);

// The paths `nipa help` can name: every command, and every subcommand of a group.
const pathsOf = (command: CommandSpec): readonly CommandPath[] =>
  command.kind === "group"
    ? [[command], ...command.subcommands.map((sub) => [command, sub] as const)]
    : [[command]];

const PATHS: readonly CommandPath[] = [
  ...visibleCommands(spec),
  ...spec.hidden,
].flatMap(pathsOf);

const commandNamed = (name: string): CommandSpec => {
  const found = visibleCommands(spec).find((c) => c.name === name);
  if (!found) {
    throw new Error(`no command named ${name}`);
  }
  return found;
};

const nameOf = (path: CommandPath): string =>
  `nipa ${path.map((s) => s.name).join(" ")}`;

// Colors only appear on a terminal, and tests may run on one.
const plain = (text: string): string => stripVTControlCharacters(text);

const PAGES: readonly (readonly [string, string, readonly Example[]])[] = [
  ["nipa", plain(mainHelp({ program: spec, version: "1.2.3" })), spec.examples],
  ...PATHS.map(
    (path) =>
      [
        nameOf(path),
        plain(commandHelp(path)),
        path.at(-1)?.examples ?? [],
      ] as const
  ),
];

const WIDTH = 80;

describe("help pages", () => {
  test("the table covers the commands, their subcommands and the hidden one", () => {
    expect(PAGES.map(([name]) => name)).toContain("nipa server stop");
    expect(PAGES.map(([name]) => name)).toContain("nipa __complete");
    expect(PAGES.length).toBeGreaterThan(30);
  });

  test.each(PAGES)(
    "%s fits 80 columns, except an example command",
    (_name, text, examples) => {
      const commands = new Set(examples.map((e) => e.command));
      const tooWide = text
        .split("\n")
        .filter((line) => line.length > WIDTH)
        .filter((line) => !commands.has(line.trim()));
      expect(tooWide).toEqual([]);
    }
  );

  test.each(PAGES)(
    "%s has no prompt mark, trailer or lowercase title",
    (_name, text) => {
      expect(
        text.split("\n").filter((l) => l.trimStart().startsWith("$ "))
      ).toEqual([]);
      expect(text).not.toContain("--help for a command's options");
      expect(text).not.toContain("Global options");
      expect(text).not.toContain("Run tools");
    }
  );

  test.each(PAGES)(
    "%s indents an example command two columns past its description",
    (_name, text, examples) => {
      for (const example of examples) {
        const lines = text.split("\n");
        const at = lines.indexOf(`      ${example.command}`);
        expect(at).toBeGreaterThan(1);
        expect(lines[at - 1]).toMatch(/^ {4}\S/u);
      }
    }
  );
});

describe("the main page", () => {
  const main = plain(mainHelp({ program: spec, version: "1.2.3" }));

  test("lists a command by its name alone", () => {
    for (const command of visibleCommands(spec)) {
      const row = main
        .split("\n")
        .find(
          (line) =>
            line.startsWith(`    ${command.name} `) ||
            line === `    ${command.name}`
        );
      expect(row).toBeDefined();
      expect(row).not.toMatch(/[[<]/u);
    }
    expect(main).not.toContain("server [ls");
    expect(main).not.toContain("profile [ls");
  });

  test("wraps a summary that does not fit beside its name, and cuts nothing", () => {
    const whoami = commandNamed("whoami");
    const summary =
      "Show who you are logged in as, which project and which profile that session belongs to";
    const long = {
      ...spec,
      sections: [
        {
          commands: [{ ...whoami, summary }],
          title: "Session",
        },
      ],
    };
    const page = plain(mainHelp({ program: long, version: "1.2.3" }));
    expect(summary.length + 4 + 6 + 3).toBeGreaterThan(WIDTH);
    expect(page).toContain(
      "\n    whoami\n      Show who you are logged in as, which project and which profile that\n      session belongs to\n"
    );
    expect(page.replaceAll(/\s+/gu, " ")).toContain(summary);
  });

  test("every row of the real table sits beside its name", () => {
    for (const command of visibleCommands(spec)) {
      expect(main).toContain(
        `    ${command.name.padEnd(10)}   ${command.summary}\n`
      );
    }
  });

  test("keeps the global options in full, sorted by long name", () => {
    const start = main.indexOf("Global Options:");
    const end = main.indexOf("Examples:");
    const block = main.slice(start, end);
    const longs = GLOBAL_FLAGS.map((f) => f.long).toSorted();
    const at = longs.map((long) => block.indexOf(`--${long}`));
    expect(at.every((i) => i > 0)).toBe(true);
    expect(at).toEqual(at.toSorted((a, b) => a - b));
    expect(block).toContain("-P, --profile <name>");
    expect(block).toMatch(
      /-p, --project <project> +Use this project for this run; login saves it\n/u
    );
  });

  test("titles are Title Case with a colon", () => {
    for (const title of [
      "Usage:",
      "Session:",
      "Resources:",
      "Run Tools:",
      "Setup:",
      "Global Options:",
      "Examples:",
    ]) {
      expect(main).toContain(`  ${title}`);
    }
  });
});

describe("a command page", () => {
  test("puts the summary directly under the usage line", () => {
    const lines = plain(commandHelp([commandNamed("login")])).split("\n");
    expect(lines[1]).toBe("  Usage: nipa login [options]");
    expect(lines[2]).toBe(`  ${commandNamed("login").summary}`);
  });

  test("points to the global options instead of listing them", () => {
    for (const [name, text] of PAGES) {
      if (name === "nipa") {
        continue;
      }
      expect(text).toContain("  Global Options: nipa --help\n");
      expect(text).not.toContain("--non-interactive");
      expect(text).not.toContain("--version");
    }
  });

  test("a group lists each subcommand's flag once, sorted by long name", () => {
    const server = plain(commandHelp([commandNamed("server")]));
    const options = server.slice(
      server.indexOf("  Options:"),
      server.indexOf("Global Options:")
    );
    const longs = [
      ...options.matchAll(/^ {4}(?:-\w, | {4})--(?<long>[a-z-]+)/gmu),
    ].map((m) => m.groups?.long);
    expect(longs).toEqual(["json", "no-wait", "tail", "timeout", "yes"]);
  });

  test("a wrapped description sits two columns in from its label's text", () => {
    const server = plain(commandHelp([commandNamed("server")])).split("\n");
    const at = server.indexOf("        --no-wait");
    expect(at).toBeGreaterThan(0);
    // The label's text starts at column 8, so the description starts at 10.
    expect(server[at + 1]).toMatch(/^ {10}\S/u);
  });

  test.each(PAGES)(
    "%s never puts a wrapped description left of its flag",
    (_name, text) => {
      const lines = text.split("\n");
      for (const [i, line] of lines.entries()) {
        const label = /^ {4}(?<pad> *)-\S+(?:, --\S+)?(?: <\S+>)?$/u.exec(line);
        const next = lines[i + 1] ?? "";
        if (label && next.trim() !== "") {
          const start = 4 + (label.groups?.pad?.length ?? 0);
          expect(next.length - next.trimStart().length).toBe(start + 2);
        }
      }
    }
  );

  test("a subcommand's own page keeps what its shorter row drops", () => {
    const page = PAGES.find(([name]) => name === "nipa server inspect")?.[1];
    expect(page?.replaceAll(/\s+/gu, " ")).toContain(
      "flavor, addresses, volumes and security groups"
    );
  });

  test("a group keeps a subcommand's arguments beside its name when they fit", () => {
    const server = plain(commandHelp([commandNamed("server")]));
    expect(server).toMatch(
      /^ {4}stop <server> \[options\] {3,}Stop a server$/mu
    );
  });
});

import { afterEach, describe, expect, test } from "bun:test";

import { program } from "../../../src/commands";
import { programSpec } from "../../../src/util/command";
import {
  inRun,
  scopedText,
  setRunScope,
  shellQuote,
  suggest,
} from "../../../src/util/scope";
import type { RunScope } from "../../../src/util/scope";

const specs = programSpec(program);
const scope = (given: { profile?: string; project?: string }): RunScope => ({
  ...given,
  program: specs,
});

afterEach(() => setRunScope(undefined));

describe("suggest", () => {
  test("a run without -P or -p gets the command as it was written", () => {
    expect(suggest("nipa server ls", scope({}))).toEqual({
      argv: ["nipa", "server", "ls"],
      command: "nipa server ls",
    });
    expect(suggest("nipa server ls")).toEqual({
      argv: ["nipa", "server", "ls"],
      command: "nipa server ls",
    });
  });

  test("-p goes after nipa, and a name with spaces stays one argv word", () => {
    expect(suggest("nipa server ls", scope({ project: "My Project" }))).toEqual(
      {
        argv: ["nipa", "-p", "My Project", "server", "ls"],
        command: "nipa -p 'My Project' server ls",
      }
    );
  });

  test("a quote in the name is escaped in the line and kept in the argv", () => {
    const { argv, command } = suggest(
      "nipa server ls",
      scope({ project: 'Bob\'s "lab"' })
    );
    expect(argv).toEqual(["nipa", "-p", 'Bob\'s "lab"', "server", "ls"]);
    expect(command).toBe(String.raw`nipa -p 'Bob'\''s "lab"' server ls`);
  });

  test("a name starting with a dash stays one word with its option", () => {
    expect(suggest("nipa server ls", scope({ project: "-dash" }))).toEqual({
      argv: ["nipa", "--project=-dash", "server", "ls"],
      command: "nipa --project=-dash server ls",
    });
  });

  test("-P and -p together keep the order -P, -p", () => {
    expect(
      suggest("nipa server ls", scope({ profile: "staging", project: "Beta" }))
    ).toEqual({
      argv: ["nipa", "-P", "staging", "-p", "Beta", "server", "ls"],
      command: "nipa -P staging -p Beta server ls",
    });
  });

  test("a command that already says the profile or project keeps its own", () => {
    expect(
      suggest(
        "nipa login -P staging",
        scope({ profile: "prod", project: "Beta" })
      ).command
    ).toBe("nipa login -P staging");
    expect(
      suggest(
        "nipa -P staging os server list",
        scope({ profile: "prod", project: "Beta" })
      ).command
    ).toBe("nipa -p Beta -P staging os server list");
  });

  test("login never repeats -p, because there it saves the project", () => {
    expect(
      suggest("nipa login", scope({ profile: "staging", project: "Beta" }))
    ).toEqual({
      argv: ["nipa", "-P", "staging", "login"],
      command: "nipa -P staging login",
    });
    expect(suggest("nipa login", scope({ project: "Beta" })).command).toBe(
      "nipa login"
    );
  });

  test("the commands that refuse -p never get it", () => {
    for (const command of [
      "nipa whoami",
      "nipa doctor",
      "nipa switch <project>",
      "nipa link <project>",
      "nipa unlink",
      "nipa logout",
    ]) {
      expect(suggest(command, scope({ project: "Beta" })).command).toBe(
        command
      );
    }
  });

  test("profile commands name profiles themselves, so they get neither", () => {
    expect(
      suggest(
        "nipa profile add staging",
        scope({ profile: "staging", project: "Beta" })
      ).command
    ).toBe("nipa profile add staging");
    expect(
      suggest("nipa profile ls", scope({ profile: "staging" })).argv
    ).toEqual(["nipa", "profile", "ls"]);
  });

  test("words after os, tf and exec belong to the program", () => {
    expect(
      suggest("nipa os server list -p x", scope({ project: "Beta" })).argv
    ).toEqual(["nipa", "-p", "Beta", "os", "server", "list", "-p", "x"]);
  });

  test("a line break in the name can't start a second line", () => {
    const { argv, command } = suggest(
      "nipa server ls",
      scope({ project: "a\nb" })
    );
    expect(argv[2]).toBe("a\nb");
    expect(command).toBe(String.raw`nipa -p 'a\nb' server ls`);
  });
});

describe("shellQuote", () => {
  test("leaves safe words bare", () => {
    expect(shellQuote("Beta-2/x.y:z")).toBe("Beta-2/x.y:z");
  });

  test("quotes for PowerShell on Windows", () => {
    expect(shellQuote("it's", "win32")).toBe("'it''s'");
    expect(shellQuote("My Project", "win32")).toBe("'My Project'");
  });

  test("quotes an empty word", () => {
    expect(shellQuote("")).toBe("''");
  });
});

describe("scopedText", () => {
  const beta = scope({ project: "My Project" });

  test("rewrites each backticked nipa command and nothing else", () => {
    expect(
      scopedText(
        "Run `nipa server start db-1` to start it. Add `--yes` or see `nipa --help`.",
        beta
      )
    ).toBe(
      "Run `nipa -p 'My Project' server start db-1` to start it. Add `--yes` or see `nipa --help`."
    );
  });

  test("handles two commands in one hint", () => {
    expect(
      scopedText(
        "Run `nipa server history web-1` to see what failed, and `nipa server logs web-1` for its console log.",
        beta
      )
    ).toBe(
      "Run `nipa -p 'My Project' server history web-1` to see what failed, and `nipa -p 'My Project' server logs web-1` for its console log."
    );
  });

  test("leaves text that names no command alone", () => {
    for (const text of [
      "Your projects: Alpha, Beta",
      "nipa server ls without backticks",
      "Run `nipa` or `nipa nope` or `nipa <command>`.",
      "`nipa login` is for -p, and `nipa unlink` ignores it",
    ]) {
      expect(scopedText(text, beta)).toBe(text);
    }
  });

  test("uses the run's scope by default, and none once it is cleared", () => {
    setRunScope(beta);
    expect(inRun("Run `nipa server ls`.")).toBe(
      "Run `nipa -p 'My Project' server ls`."
    );
    setRunScope(undefined);
    expect(inRun("Run `nipa server ls`.")).toBe("Run `nipa server ls`.");
  });
});

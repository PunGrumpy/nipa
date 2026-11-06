import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { PassThrough } from "node:stream";

import { nameCell } from "../../../src/commands/server/format";
import type { Server } from "../../../src/util/compute";
import { palette } from "../../../src/util/theme";
import {
  createPrompts,
  printable,
  printFields,
  printTable,
  withSpinner,
  withDetail,
  writeStderr,
} from "../../../src/util/ui";

const ESC = "\u001B";
const BEL = "\u0007";

describe("printable", () => {
  test.each([
    ["an OSC title, ended by BEL", `a${ESC}]0;pwned${BEL}b`, "ab"],
    ["an OSC title, ended by ST", `a${ESC}]0;pwned${ESC}\\b`, "ab"],
    ["a CSI cursor move", `a${ESC}[2Ab${ESC}[1;1Hc`, "abc"],
    ["a CSI erase", `a${ESC}[2Kb`, "ab"],
    ["a terminal reset", `a${ESC}cb`, "ab"],
    ["a DCS string", `a${ESC}Pq#0;2;0;0;0${ESC}\\b`, "ab"],
    ["a bare ESC", `a${ESC}é`, "aé"],
    ["a two-byte escape", `a${ESC}b`, "a"],
    ["the ESC of an unfinished CSI", `a${ESC}[12`, "a[12"],
    ["a carriage return and a backspace", "abc\r\u0008x", "abcx"],
    ["a C1 control", "a\u009Bb\u0085c", "abc"],
    ["a bidi override", "evil‮fdp.exe", "evilfdp.exe"],
    ["zero-width characters", "a​b‍c﻿d", "abcd"],
    ["Unicode tag characters", `a${String.fromCodePoint(0xe_00_41)}b`, "ab"],
  ])("removes %s", (_name, input, expected) => {
    expect(printable(input)).toBe(expected);
  });

  test("keeps Thai text with its combining marks", () => {
    expect(printable("กำ เซิร์ฟเวอร์ ที่ 1")).toBe("กำ เซิร์ฟเวอร์ ที่ 1");
  });

  test("keeps newlines and ordinary text", () => {
    expect(printable("one\ntwo ✔ → é")).toBe("one\ntwo ✔ → é");
  });

  test("keeps the colors nipa's helpers write", () => {
    const colors = palette(true);
    const line = `${colors.bold("x")} ${colors.dim("y")} ${colors.red("r")} ${colors.green("g")} ${colors.yellow("y")} ${colors.cyan("c")} ${colors.gray("z")}`;
    expect(line).toContain(ESC);
    expect(printable(line)).toBe(line);
  });

  test("removes SGR codes nipa doesn't write, such as conceal and 256 colors", () => {
    expect(printable(`${ESC}[8mhidden${ESC}[0m ${ESC}[38;5;9mred`)).toBe(
      "hidden red"
    );
  });
});

describe("what reaches stderr", () => {
  let written: string[];
  let spy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    written = [];
    spy = spyOn(process.stderr, "write").mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  test("writeStderr filters its line", () => {
    writeStderr(`name ${ESC}]0;x${BEL}${ESC}[2J‮ok`);
    expect(written).toEqual(["name ok\n"]);
  });

  test("the spinner filters its message", async () => {
    const tty = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
    Object.defineProperty(process.stderr, "isTTY", {
      configurable: true,
      value: true,
    });
    try {
      await withSpinner(`Loading ${ESC}]0;x${BEL}${ESC}[2Jweb\n1…`, () =>
        Bun.sleep(400)
      );
    } finally {
      if (tty) {
        Object.defineProperty(process.stderr, "isTTY", tty);
      } else {
        Reflect.deleteProperty(process.stderr, "isTTY");
      }
    }
    const frames = written.filter((chunk) => chunk.includes("Loading"));
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      expect(frame).toContain("Loading web1…");
      expect(frame).not.toContain("0;x");
      expect(frame).not.toContain("\n");
    }
  });

  test("a table cell with a newline stays on one row", () => {
    printTable({
      headings: ["Name", "Status"],
      rows: [
        [{ text: "web-1\nforged  ACTIVE" }, { text: "ACTIVE" }],
        [{ text: "db-1" }, { text: "SHUTOFF" }],
      ],
    });
    const lines = written.join("").split("\n");
    // A blank line, the headings, two rows, a blank line, and the end.
    expect(lines).toHaveLength(6);
    expect(lines[2]).toContain(String.raw`web-1\nforged  ACTIVE`);
    expect(lines[3]).toContain("db-1");
  });

  test("a table cell can't carry an escape, even SGR, from a remote name", () => {
    printTable({
      headings: ["Name"],
      rows: [[{ text: `evil${ESC}[31m${ESC}]0;x${BEL}\r\tname` }]],
    });
    const output = written.join("");
    expect(output).toContain(String.raw`evil\r\tname`);
    expect(output).not.toContain("[31m");
    expect(output).not.toContain("0;x");
    expect(output).not.toContain("\r");
  });

  test("withDetail can't carry an escape in its text either", () => {
    const cell = withDetail(`a${ESC}[31mb`, " (c)");
    expect(cell.text).toBe("ab (c)");
    expect(cell.paint?.(cell.text)).not.toContain("[31m");
  });

  test("a field value with a newline stays on its own line", () => {
    printFields([
      { label: "Name", lines: [{ text: `a\n  Status   forged${ESC}[2J` }] },
      { label: "Status", lines: [{ text: "ACTIVE" }] },
    ]);
    const lines = written.join("").split("\n");
    expect(lines).toHaveLength(5);
    expect(written.join("")).not.toContain(`${ESC}[2J`);
  });
});

describe("remote values in painted cells", () => {
  test("a detail cell keeps its column's padding", () => {
    const write = spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      printTable({
        headings: ["Name", "Status"],
        rows: [
          [withDetail("n1", " (Kubernetes master)"), { text: "ACTIVE" }],
          [
            { text: "a-much-longer-server-name-than-n1-here" },
            { text: "ACTIVE" },
          ],
        ],
      });
      const output = write.mock.calls.map(([chunk]) => String(chunk)).join("");
      const lines = Bun.stripANSI(output)
        .split("\n")
        .filter((line) => line.includes("ACTIVE"));
      expect(lines).toHaveLength(2);
      expect(lines[0]?.indexOf("ACTIVE")).toBe(lines[1]?.indexOf("ACTIVE"));
    } finally {
      write.mockRestore();
    }
  });

  test("a Kubernetes node's name can't forge a row or carry an escape", () => {
    const write = spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const server: Server = {
        addresses: [],
        createdAt: "2026-01-01T00:00:00Z",
        flavor: "m1.small",
        id: "id",
        kubernetes: { clusterId: "c", role: "master", version: null },
        name: `evil\n> Success! forged${ESC}[31m${ESC}]0;t${BEL}`,
        ramMb: null,
        securityGroups: [],
        status: "ACTIVE",
        vcpus: null,
        volumes: [],
        zone: null,
      };
      printTable({ headings: ["Name"], rows: [[nameCell(server)]] });
      const output = write.mock.calls.map(([chunk]) => String(chunk)).join("");
      expect(Bun.stripANSI(output)).toContain(
        String.raw`evil\n> Success! forged (Kubernetes master)`
      );
      expect(output).not.toContain("\n> Success!");
      expect(output).not.toContain(`${ESC}[31m`);
      expect(output).not.toContain(`${ESC}]0;`);
    } finally {
      write.mockRestore();
    }
  });
});

const streams = () => {
  const stdin = new PassThrough();
  const stderr = new PassThrough();
  let output = "";
  stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  // Answers once the prompt has drawn, so it's listening.
  const answer = (keys: string): void => {
    stderr.once("data", () => {
      setTimeout(() => stdin.write(keys), 20);
    });
  };
  return { answer, output: () => output, stderr, stdin };
};

describe("prompts", () => {
  test("a confirmation can't carry a remote escape sequence", async () => {
    const { answer: press, output, stderr, stdin } = streams();
    press("n\r");
    const answer = createPrompts({ stderr, stdin }).confirm({
      default: false,
      message: `Stop server evil${ESC}]0;t${BEL}${ESC}[2J?`,
    });
    expect(await answer).toBe(false);
    expect(output()).toContain("Stop server evil?");
    expect(output()).not.toContain(`${ESC}]0;`);
  });

  test("a choice's name can't carry a remote escape sequence", async () => {
    const { answer: press, output, stderr, stdin } = streams();
    press("\r");
    const answer = createPrompts({ stderr, stdin }).choice({
      choices: [{ name: `evil${ESC}]0;t${BEL}`, value: 1 }],
      message: "Switch to:",
    });
    expect(await answer).toBe(1);
    expect(output()).toContain("evil");
    expect(output()).not.toContain(`${ESC}]0;`);
  });
});

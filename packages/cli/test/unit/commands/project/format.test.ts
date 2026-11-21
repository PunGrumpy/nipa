import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import {
  idCell,
  markerOf,
  pipeRows,
  printProjects,
} from "../../../../src/commands/project/format";
import type { ProjectsDocument } from "../../../../src/util/projects";

const ALPHA = "a".repeat(32);
const BETA = "b".repeat(32);
const GAMMA = "c".repeat(32);

// Alpha is the saved project. The folder's link, when there is one, is what
// commands here use, so it is the one marked current.
const documentOf = (
  link: ProjectsDocument["link"] = null,
  names: readonly string[] = ["Alpha", "Beta", "Gamma"]
): ProjectsDocument => {
  const ids = [ALPHA, BETA, GAMMA];
  const current = link?.project.id ?? ALPHA;
  return {
    link,
    profile: "prod",
    project: { id: ALPHA, name: "Alpha" },
    projects: names.map((name, index) => {
      const id = ids[index] ?? `${index}`.repeat(32);
      return { current: id === current, id, name };
    }),
  };
};

const linkedTo = (id: string, name: string): ProjectsDocument["link"] => ({
  file: "/work/.nipa/project.json",
  project: { id, name },
});

describe("project ls rows", () => {
  test("marks the project this folder uses, and the saved one when it differs", () => {
    const document = documentOf(linkedTo(BETA, "Beta"));
    const markers = document.projects.map((project) =>
      markerOf(document, project)
    );
    expect(markers).toEqual(["  (saved)", "  (current)", ""]);
  });

  test("with no link, the saved project is (current) and nothing says (saved)", () => {
    const document = documentOf();
    const markers = document.projects.map((project) =>
      markerOf(document, project)
    );
    expect(markers).toEqual(["  (current)", "", ""]);
  });

  test("a link to the saved project says (current) once", () => {
    const document = documentOf(linkedTo(ALPHA, "Alpha"));
    const markers = document.projects.map((project) =>
      markerOf(document, project)
    );
    expect(markers).toEqual(["  (current)", "", ""]);
  });

  test("a pipe row is the ID, then the name", () => {
    expect(pipeRows(documentOf())).toEqual([
      [ALPHA, "Alpha"],
      [BETA, "Beta"],
      [GAMMA, "Gamma"],
    ]);
  });
});

describe("project ls table", () => {
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

  const lines = (document: ProjectsDocument, width: number): string[] => {
    printProjects(document, width);
    return Bun.stripANSI(written.join("")).split("\n");
  };

  test.each([120, 80])(
    "prints the full ID and the markers at %d columns",
    (width) => {
      const out = lines(documentOf(linkedTo(BETA, "Beta")), width);
      expect(out[1]).toMatch(/^ {2}Name {2,}ID$/u);
      expect(out.some((line) => line.endsWith(`${ALPHA}  (saved)`))).toBe(true);
      expect(out.some((line) => line.endsWith(`${BETA}  (current)`))).toBe(
        true
      );
      expect(out.some((line) => line.endsWith(GAMMA))).toBe(true);
      expect(out.join("\n")).not.toContain("(this folder)");
      expect(Math.max(...out.map((line) => line.length))).toBeLessThanOrEqual(
        width
      );
    }
  );

  test("a terminal too narrow for both columns gets a record per project", () => {
    const out = lines(documentOf(linkedTo(BETA, "Beta")), 40);
    expect(out.join("\n")).not.toMatch(/Name\s+ID/u);
    expect(out).toContain("  Alpha");
    expect(out).toContain(`    ${ALPHA}  (saved)`);
    expect(out).toContain(`    ${BETA}  (current)`);
    expect(out).toContain(`    ${GAMMA}`);
  });

  test("a row with no marker has a plain ID cell, so no escape follows the ID", () => {
    const document = documentOf(linkedTo(BETA, "Beta"));
    const [saved, current, plain] = document.projects.map((project) =>
      idCell(document, project)
    );
    // A painted cell dims what follows the ID, which is empty here.
    expect(plain).toEqual({ text: GAMMA });
    expect(saved?.paint).toBeFunction();
    expect(current?.paint).toBeFunction();
  });

  test("a name that holds a newline stays on one line", () => {
    const out = lines(documentOf(null, ["Odd\n> forged"]), 80);
    expect(out.some((line) => line.startsWith("> forged"))).toBe(false);
    expect(out.join("\n")).toContain("Odd\\n> forged");
  });
});

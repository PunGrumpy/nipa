import type { ListedProject, ProjectsDocument } from "../../util/projects";
import type { Cell } from "../../util/ui";
import { printTable, withDetail } from "../../util/ui";

export const PIPE_HEADINGS = ["ID", "Name"];

/**
 * What follows a project's ID: `(current)` on the project commands here use,
 * and `(saved)` on the saved session's project when that is a different one.
 */
export const markerOf = (
  document: Pick<ProjectsDocument, "project">,
  project: { current: boolean; id: string }
): string => {
  if (project.current) {
    return "  (current)";
  }
  return document.project.id === project.id ? "  (saved)" : "";
};

export const idCell = (
  document: ProjectsDocument,
  project: ListedProject
): Cell => {
  const marker = markerOf(document, project);
  // A plain cell, so a row with no marker carries no empty color sequence.
  return marker === "" ? { text: project.id } : withDetail(project.id, marker);
};

const tableRows = (document: ProjectsDocument): Cell[][] =>
  document.projects.map((project) => [
    { text: project.name },
    idCell(document, project),
  ]);

/** Name and ID in full. A terminal too narrow for both gets a record per project. */
export const printProjects = (
  document: ProjectsDocument,
  width: number
): void => {
  printTable({
    fit: { droppable: [], width },
    headings: ["Name", "ID"],
    rows: tableRows(document),
  });
};

// The ID first, as `server ls` does, so `cut -f1` gives what `-p` takes.
export const pipeRows = (document: ProjectsDocument): string[][] =>
  document.projects.map((project) => [project.id, project.name]);

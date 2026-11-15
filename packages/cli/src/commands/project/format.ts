import type { ProjectsDocument } from "../../util/projects";
import type { Cell } from "../../util/ui";
import { printTable, withDetail } from "../../util/ui";

export const PIPE_HEADINGS = ["ID", "Name"];

/** What follows a project's ID: the saved project, or the one this folder links to. */
export const markerOf = (
  document: Pick<ProjectsDocument, "link">,
  project: { current: boolean; id: string }
): string => {
  if (project.current) {
    return "  (current)";
  }
  return document.link?.project.id === project.id ? "  (this folder)" : "";
};

const tableRows = (document: ProjectsDocument): Cell[][] =>
  document.projects.map((project) => [
    { text: project.name },
    withDetail(project.id, markerOf(document, project)),
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

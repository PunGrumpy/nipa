// The document `nipa project ls --json` prints and the `list_projects` tool
// returns, so a script and an assistant see the same projects.

import type { Project } from "./keystone";
import { listedProjects } from "./session";
import type { ActiveProfile } from "./session";
import type { Session } from "./store";

export interface ListedProject {
  /** The project the saved session is scoped to, the one `nipa switch` changes. */
  readonly current: boolean;
  readonly id: string;
  readonly name: string;
}

export interface ProjectsDocument {
  readonly link: { file: string; project: Project } | null;
  readonly profile: string;
  readonly project: Project;
  readonly projects: readonly ListedProject[];
}

/** The profile's projects by name, as the saved session sees them. */
export const projectsDocument = async (
  active: ActiveProfile,
  session: Session
): Promise<ProjectsDocument> => {
  const projects = await listedProjects(active, session);
  return {
    link: active.link
      ? { file: active.link.file, project: active.link.link.project }
      : null,
    profile: active.name,
    project: session.project,
    projects: projects
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map(({ id, name }) => ({
        current: id === session.project.id,
        id,
        name,
      })),
  };
};

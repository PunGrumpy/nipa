// The document `nipa project ls --json` prints and the `list_projects` tool
// returns, so a script and an assistant see the same projects.

import type { Project } from "./keystone";
import { listedProjects } from "./session";
import type { ActiveProfile } from "./session";
import type { Session } from "./store";

export interface ListedProject {
  /** The project commands here use: see `currentProjectId`. */
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

/**
 * The project a bare command here uses: the folder's link when it names the
 * run's profile, else the saved session's project. `nipa server search` and
 * `nipa project ls` both mark it `current`.
 */
export const currentProjectId = (
  active: ActiveProfile,
  session: Session
): string => active.link?.link.project.id ?? session.project.id;

/**
 * The profile's projects with the one commands here use marked `current`. The
 * order is the one `listProjects` returns, by name. `runProject` is the run's
 * `-p` as typed, which `nipa mcp` has and the command refuses: a listed ID or,
 * failing that, a listed name wins over the link and the saved project, and
 * one that matches nothing leaves them to decide.
 */
export const projectsDocument = async (
  active: ActiveProfile,
  session: Session,
  runProject?: string
): Promise<ProjectsDocument> => {
  const projects = await listedProjects(active, session);
  const asked =
    runProject === undefined
      ? undefined
      : (projects.find((project) => project.id === runProject) ??
        projects.find((project) => project.name === runProject));
  const current = asked?.id ?? currentProjectId(active, session);
  return {
    link: active.link
      ? { file: active.link.file, project: active.link.link.project }
      : null,
    profile: active.name,
    project: session.project,
    projects: projects.map(({ id, name }) => ({
      current: id === current,
      id,
      name,
    })),
  };
};

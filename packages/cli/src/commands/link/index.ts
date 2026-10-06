import path from "node:path";

import { handle } from "../../util/command";
import { listProjects } from "../../util/keystone";
import { displayPath, saveLink } from "../../util/link";
import { askProject, pickProject } from "../../util/session";
import {
  bold,
  CliError,
  dim,
  log,
  note,
  success,
  withSpinner,
} from "../../util/ui";
import { linkCommand } from "./command";

export const link = handle(linkCommand, async ({ args, client }) => {
  const { project: wanted } = args;
  // The saved session lists the projects, whatever the folder links to now.
  const { active, session } = await client.savedSession();
  const projects = await withSpinner("Loading your projects…", () =>
    listProjects({ authUrl: active.profile.authUrl, token: session.token })
  );
  if (wanted === undefined && !client.prompts.interactive) {
    throw new CliError("tell nipa which project to link", {
      exitCode: 2,
      hint: `Run \`nipa link <project>\`. Your projects: ${projects.map((p) => p.name).join(", ")}`,
    });
  }
  const dir = process.cwd();
  const current = active.link?.link.project ?? session.project;
  const project = await pickProject({
    ask: askProject({ current, message: "Link to:", prompts: client.prompts }),
    projects,
    wanted,
  });
  const here =
    active.link && path.dirname(path.dirname(active.link.file)) === dir;
  if (here && active.link?.link.project.id === project.id) {
    note(`This folder is already linked to ${bold(project.name)}`);
    return 0;
  }
  const file = await saveLink({
    dir,
    link: { profile: active.name, project },
  });
  const profile = dim(`(${active.name})`);
  success(`Linked ${displayPath(file)} to ${bold(project.name)} ${profile}`);
  log(
    `Commands in this folder now use ${project.name}. Run \`nipa unlink\` to stop.`
  );
  return 0;
});

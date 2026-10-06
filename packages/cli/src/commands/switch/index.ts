import { handle } from "../../util/command";
import { listProjects, rescope } from "../../util/keystone";
import { displayPath } from "../../util/link";
import {
  askProject,
  pickProject,
  saveLogin,
  toSession,
} from "../../util/session";
import { bold, CliError, note, success, withSpinner } from "../../util/ui";
import { switchCommand } from "./command";

export const switchProject = handle(switchCommand, async ({ args, client }) => {
  const { project: wanted } = args;
  // switch changes the saved project, so a linked folder doesn't count.
  const { active, session } = await client.savedSession();
  const { authUrl } = active.profile;
  const projects = await withSpinner("Loading your projects…", () =>
    listProjects({ authUrl, token: session.token })
  );
  if (wanted === undefined && !client.prompts.interactive) {
    throw new CliError("tell nipa which project to use", {
      exitCode: 2,
      hint: `Run \`nipa switch <project>\`. Your projects: ${projects.map((p) => p.name).join(", ")}`,
    });
  }
  const project = await pickProject({
    ask: askProject({
      current: session.project,
      message: "Switch to:",
      prompts: client.prompts,
    }),
    projects,
    wanted,
  });
  if (project.id === session.project.id) {
    note(`You're already using ${bold(project.name)}`);
    return 0;
  }
  const started = performance.now();
  const token = await withSpinner(`Switching to ${project.name}…`, () =>
    rescope({ authUrl, projectId: project.id, token: session.token })
  );
  await saveLogin({ active, session: toSession(token, project) });
  success(`Switched to ${bold(project.name)}`, performance.now() - started);
  const linked = active.link;
  if (linked && linked.link.project.id !== project.id) {
    note(
      `Commands in this folder still use ${bold(linked.link.project.name)}, from ${displayPath(linked.file)}. Run \`nipa unlink\` to use ${project.name} here too.`
    );
  }
  return 0;
});

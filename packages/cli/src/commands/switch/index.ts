import { listProjects, rescope } from "../../lib/keystone";
import type { Project } from "../../lib/keystone";
import { pickProject, saveLogin, toSession } from "../../lib/session";
import { bold, CliError, note, success, withSpinner } from "../../lib/ui";
import type { Prompts } from "../../lib/ui";
import { handle } from "../../util/command";
import { switchCommand } from "./command";

const askProject =
  (prompts: Prompts, current: Project) => (projects: readonly Project[]) =>
    prompts.choice({
      choices: projects.map((p) => ({
        description: p.id,
        name: p.id === current.id ? `${p.name} ${bold("(current)")}` : p.name,
        value: p,
      })),
      default: projects.find((p) => p.id === current.id),
      message: "Switch to:",
    });

export const switchProject = handle(switchCommand, async ({ args, client }) => {
  const { project: wanted } = args;
  const { active, session } = await client.session();
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
    ask: askProject(client.prompts, session.project),
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
  return 0;
});

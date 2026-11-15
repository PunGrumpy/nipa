import { handle } from "../../util/command";
import { projectsDocument } from "../../util/projects";
import {
  bold,
  dim,
  formatElapsed,
  log,
  oneLine,
  plural,
  stderrWidth,
  tabSeparated,
} from "../../util/ui";
import { lsSubcommand } from "./command";
import { PIPE_HEADINGS, pipeRows, printProjects } from "./format";

export const ls = handle(lsSubcommand, async ({ client, flags }) => {
  // The saved session, so a linked folder or `-p` doesn't change the list.
  const { active, session } = await client.savedSession();
  const started = performance.now();
  const document = await projectsDocument(active, session);
  if (flags.json) {
    client.stdout.json(document);
    return 0;
  }
  const elapsed = dim(`[${formatElapsed(performance.now() - started)}]`);
  const { projects } = document;
  log(
    projects.length === 0
      ? `No projects in ${bold(oneLine(active.name))} ${elapsed}`
      : `${plural(projects.length, "project")} in ${bold(oneLine(active.name))} ${elapsed}`
  );
  if (!client.stdout.isTTY) {
    client.stdout.line(tabSeparated(PIPE_HEADINGS, pipeRows(document)));
  } else if (projects.length > 0) {
    printProjects(document, stderrWidth());
  }
  return 0;
});

import { handle } from "../../util/command";
import { investigate as investigateResource } from "../../util/investigate";
import { formatElapsed, withSpinner } from "../../util/ui";
import { investigateCommand } from "./command";
import { printInvestigation } from "./view";

export const investigate = handle(
  investigateCommand,
  async ({ args, client, flags }) => {
    const { active, session, space } = await client.cloud();
    const { project } = session;
    const started = performance.now();
    const investigation = await withSpinner(
      `Investigating ${args.resource} in ${project.name}…`,
      () =>
        investigateResource(space, {
          kind: flags.kind,
          projectName: project.name,
          ref: args.resource,
        })
    );
    if (flags.json) {
      client.stdout.json({ investigation, profile: active.name, project });
      return 0;
    }
    printInvestigation({
      elapsed: formatElapsed(performance.now() - started),
      investigation,
      projectName: project.name,
    });
    if (!client.stdout.isTTY) {
      client.stdout.line(investigation.id);
    }
    return 0;
  }
);

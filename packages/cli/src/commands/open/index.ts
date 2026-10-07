import { spacePortalUrl } from "../../util/api";
import { openInBrowser } from "../../util/browser";
import { handle } from "../../util/command";
import type { Client } from "../../util/command";
import { announceProfile, requireSpaceUrl } from "../../util/session";
import { bold, cyan, log } from "../../util/ui";
import { openCommand } from "./command";
import type { Resource } from "./command";
import { HOME, PAGES } from "./pages";

interface Target {
  readonly spaceUrl: string;
  readonly path: string;
  readonly projectName: string | undefined;
}

/** Only a named resource needs the session, to find its ID. */
const resolveTarget = async (
  client: Client,
  resource: Resource | undefined,
  name: string | undefined
): Promise<Target> => {
  if (resource !== undefined && name !== undefined) {
    const { active, session, space } = await client.cloud();
    const projectName = session.project.name;
    const found = await PAGES[resource].find({ projectName, ref: name, space });
    return { path: found.path, projectName, spaceUrl: requireSpaceUrl(active) };
  }
  const active = await client.profile();
  const spaceUrl = requireSpaceUrl(active);
  announceProfile(active);
  return {
    path: resource === undefined ? HOME : PAGES[resource].list,
    projectName: active.link?.link.project.name ?? active.profile.project?.name,
    spaceUrl,
  };
};

export const open = handle(openCommand, async ({ args, client, flags }) => {
  const target = await resolveTarget(client, args.resource, args.name);
  const url = `${spacePortalUrl(target.spaceUrl)}${target.path}`;
  if (flags.url || !client.stdout.isTTY) {
    client.stdout.line(url);
    return 0;
  }
  log(`Opening ${cyan(url)}`);
  await openInBrowser(url);
  if (target.projectName) {
    log(
      `The portal opens the project you last used in it. Switch to ${bold(target.projectName)} there if it shows another one.`
    );
  }
  return 0;
});

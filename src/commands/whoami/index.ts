import { loginLine } from "../../lib/session";
import { isActive, loadSession, msUntilExpiry } from "../../lib/store";
import { bold, CliError, dim, formatDuration, log } from "../../lib/ui";
import { handle } from "../../util/command";
import { whoamiCommand } from "./command";

export const whoami = handle(whoamiCommand, async ({ client, flags }) => {
  const active = await client.profile();
  const session = await loadSession(active.name);
  if (!isActive(session)) {
    if (flags.json) {
      client.stdout.line(
        JSON.stringify({ loggedIn: false, profile: active.name })
      );
    }
    throw new CliError(`you aren't logged in to ${active.name}`, {
      hint: `Run \`${loginLine(active.name)}\`.`,
    });
  }
  if (flags.json) {
    client.stdout.json({
      authUrl: active.profile.authUrl,
      expiresAt: session.expiresAt,
      loggedIn: true,
      profile: active.name,
      project: session.project,
      region: active.profile.region,
      user: session.user,
    });
    return 0;
  }
  if (!client.stdout.isTTY) {
    client.stdout.line(session.user.name);
    return 0;
  }
  const { host } = new URL(active.profile.authUrl);
  const expiresIn = formatDuration(msUntilExpiry(session));
  log(`Logged in as ${bold(session.user.name)}`);
  const where = dim(`(${host}, ${active.profile.region})`);
  const projectId = dim(`(${session.project.id})`);
  log(`Profile: ${bold(active.name)} ${where}`);
  log(`Project: ${bold(session.project.name)} ${projectId}`);
  log(`The session expires in ${expiresIn}`);
  return 0;
});

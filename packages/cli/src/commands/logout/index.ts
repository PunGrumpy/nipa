import { handle } from "../../util/command";
import { revoke } from "../../util/keystone";
import { clearSession, isActive, loadSession } from "../../util/store";
import { bold, note, success, withSpinner } from "../../util/ui";
import { logoutCommand } from "./command";

export const logout = handle(logoutCommand, async ({ client }) => {
  const active = await client.profile();
  const session = await loadSession(active.name);
  if (!session) {
    note(`Not logged in to ${active.name}, so \`nipa logout\` did nothing`);
    return 0;
  }
  if (isActive(session)) {
    try {
      await withSpinner("Logging out…", () =>
        revoke({ authUrl: active.profile.authUrl, token: session.token })
      );
    } catch {
      // The token expires on its own.
    }
  }
  await clearSession(active.name);
  success(`Logged out of ${bold(active.name)}`);
  return 0;
});

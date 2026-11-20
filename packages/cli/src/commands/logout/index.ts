import { handle } from "../../util/command";
import { forgetPassword } from "../../util/keychain";
import { revoke } from "../../util/keystone";
import { clearSession, isActive, loadSession } from "../../util/store";
import { bold, log, note, success, withSpinner } from "../../util/ui";
import { logoutCommand } from "./command";

export const logout = handle(logoutCommand, async ({ client }) => {
  const active = await client.profile();
  const session = await loadSession(active.name);
  const forgot = await forgetPassword(active.profile);
  if (session) {
    let revoked = true;
    if (isActive(session)) {
      try {
        await withSpinner("Logging out…", () =>
          revoke({ authUrl: active.profile.authUrl, token: session.token })
        );
      } catch {
        revoked = false;
        // It can stay valid until it expires.
      }
    }
    await clearSession(active.name);
    success(`Logged out of ${bold(active.name)}`);
    if (forgot) {
      log("Deleted your saved password.");
    }
    if (!revoked) {
      note(
        "nipa couldn't reach Keystone to revoke the token, so it stays valid until it expires."
      );
    }
  } else if (forgot) {
    success(`Deleted your saved password for ${bold(active.name)}`);
  } else {
    note(`Not logged in to ${active.name}, so \`nipa logout\` did nothing`);
  }
  return 0;
});

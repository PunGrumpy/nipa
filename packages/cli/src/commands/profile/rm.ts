import { handle } from "../../util/command";
import { revoke } from "../../util/keystone";
import {
  clearSession,
  DEFAULT_PROFILE,
  isActive,
  loadConfig,
  loadSession,
  saveConfig,
} from "../../util/store";
import { bold, CliError, log, success, usageError } from "../../util/ui";
import { rmSubcommand } from "./command";

// The parser already rejected a missing <name>: `args.name` is a string.
export const rm = handle(rmSubcommand, async ({ args, client, flags }) => {
  const { name } = args;
  const config = await loadConfig();
  const profile = config.profiles[name];
  if (!profile) {
    throw new CliError(`no profile named "${name}"`);
  }
  if (name === DEFAULT_PROFILE) {
    throw new CliError(`can't remove ${DEFAULT_PROFILE}`, {
      hint: "nipa always has the Nipa Cloud production profile.",
    });
  }
  if (!flags.yes) {
    if (!client.prompts.interactive) {
      throw usageError(
        `removing ${name} needs confirmation`,
        "Add --yes to remove it without asking."
      );
    }
    const sure = await client.prompts.confirm({
      default: false,
      message: `Remove profile ${name} and log out of it?`,
    });
    if (!sure) {
      throw new CliError("Canceled", { exitCode: 130 });
    }
  }
  const session = await loadSession(name);
  if (isActive(session)) {
    try {
      await revoke({ authUrl: profile.authUrl, token: session.token });
    } catch {
      // The token expires on its own.
    }
  }
  await clearSession(name);
  const profiles = Object.fromEntries(
    Object.entries(config.profiles).filter(([key]) => key !== name)
  );
  const wasCurrent = config.currentProfile === name;
  await saveConfig({
    currentProfile: wasCurrent ? DEFAULT_PROFILE : config.currentProfile,
    profiles,
  });
  success(`Removed profile ${bold(name)}`);
  if (wasCurrent) {
    log(`Now using ${bold(DEFAULT_PROFILE)}`);
  }
  return 0;
});

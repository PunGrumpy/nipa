import { handle } from "../../util/command";
import {
  isActive,
  loadConfig,
  loadSession,
  PROD_PROFILE,
} from "../../util/store";
import { green, log, printTable } from "../../util/ui";
import { lsSubcommand } from "./command";

export const ls = handle(lsSubcommand, async ({ client, flags }) => {
  const config = await loadConfig();
  const names = Object.keys(config.profiles).toSorted();
  const sessions = await Promise.all(names.map((name) => loadSession(name)));
  if (flags.json) {
    client.stdout.json(
      names.map((name, index) => {
        const session = sessions[index];
        return {
          current: name === config.currentProfile,
          loggedIn: isActive(session),
          name,
          ...config.profiles[name],
          user: isActive(session) ? session.user.name : undefined,
        };
      })
    );
    return 0;
  }
  const rows = names.map((name, index) => {
    const profile = config.profiles[name] ?? PROD_PROFILE;
    const session = sessions[index];
    const who = isActive(session)
      ? `${session.user.name} (${session.project.name})`
      : "-";
    return [name, new URL(profile.authUrl).host, profile.region, who].map(
      (text) => ({ text })
    );
  });
  log(`${names.length} ${names.length === 1 ? "profile" : "profiles"}`);
  printTable({
    headings: ["Name", "Keystone", "Region", "Logged in as"],
    marks: names.map((name) =>
      name === config.currentProfile ? green("✔") : " "
    ),
    rows,
  });
  return 0;
});

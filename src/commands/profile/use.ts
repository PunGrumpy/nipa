import { loadConfig, saveConfig } from "../../lib/store";
import { bold, CliError, note, success, usageError } from "../../lib/ui";
import { handle } from "../../util/command";
import { useSubcommand } from "./command";

export const use = handle(useSubcommand, async ({ args, client }) => {
  const config = await loadConfig();
  const names = Object.keys(config.profiles).toSorted();
  let { name } = args;
  if (name === undefined) {
    if (!client.prompts.interactive) {
      throw usageError("missing <name>", `Your profiles: ${names.join(", ")}`);
    }
    name = await client.prompts.choice({
      choices: names.map((n) => ({
        name: n === config.currentProfile ? `${n} ${bold("(current)")}` : n,
        value: n,
      })),
      default: config.currentProfile,
      message: "Use profile:",
    });
  }
  if (!config.profiles[name]) {
    throw new CliError(`no profile named "${name}"`, {
      hint: `Your profiles: ${names.join(", ")}`,
    });
  }
  if (name === config.currentProfile) {
    note(`You're already using ${bold(name)}`);
    return 0;
  }
  await saveConfig({ ...config, currentProfile: name });
  success(`Now using profile ${bold(name)}`);
  return 0;
});

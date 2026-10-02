import {
  completionScript,
  COMPLETION_SHELLS,
  isCompletionShell,
} from "../lib/completion";
import type { CommandSpec } from "../lib/completion";
import { listProjects } from "../lib/keystone";
import { isActive, loadConfig, loadSession } from "../lib/store";
import { CliError } from "../lib/ui";

export const completionUsage = `Usage: nipa completion <bash|zsh|fish|pwsh>

Print the tab completion script for a shell. Load it once:

  bash  echo 'eval "$(nipa completion bash)"' >> ~/.bashrc
  zsh   echo 'eval "$(nipa completion zsh)"' >> ~/.zshrc
  fish  nipa completion fish > ~/.config/fish/completions/nipa.fish
  pwsh  Add-Content $PROFILE 'nipa completion pwsh | Out-String | Invoke-Expression'

\`nipa switch <Tab>\` lists your projects while you are logged in.
`;

export const completion = (
  args: string[],
  specs: readonly CommandSpec[]
): Promise<number> => {
  const [shell] = args;
  if (shell === undefined || !isCompletionShell(shell)) {
    throw new CliError(shell ? `unknown shell "${shell}"` : "missing shell", {
      exitCode: 2,
      hint: `Use one of: ${COMPLETION_SHELLS.join(", ")}.`,
    });
  }
  process.stdout.write(completionScript(shell, specs));
  return Promise.resolve(0);
};

/**
 * Hidden: prints one project name per line for the completion scripts. Never
 * prompts and stays silent without a session, so a Tab press cannot hang.
 */
export const completeProjects = async (args: string[]): Promise<number> => {
  if (args[0] !== "projects") {
    return 2;
  }
  const session = await loadSession();
  if (!isActive(session)) {
    return 0;
  }
  const config = await loadConfig();
  const projects = await listProjects(config.authUrl, session.token);
  process.stdout.write(projects.map((p) => `${p.name}\n`).join(""));
  return 0;
};

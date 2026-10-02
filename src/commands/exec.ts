import { existsSync } from "node:fs";
import { constants, homedir } from "node:os";
import path from "node:path";

import { childEnv, sessionEnv } from "../lib/env";
import { loadConfig } from "../lib/store";
import { CliError } from "../lib/ui";
import { requireSession } from "./session";

export const execUsage = `Usage: nipa exec <command> [args...]

Run a command with the session's OS_* variables. Any OS_* already in your
shell is dropped first.

  nipa exec ansible-playbook site.yml
  nipa exec python -c 'import openstack; print(openstack.connect().identity)'
`;

const INSTALL_HINTS = new Map([
  ["openstack", "Install it with `pipx install python-openstackclient`."],
  ["terraform", "Install it with `brew install hashicorp/tap/terraform`."],
]);

/** PATH first, then ~/.local/bin, where pipx puts openstack. */
const resolve = (command: string): string | undefined => {
  const found = Bun.which(command);
  if (found) {
    return found;
  }
  const local = path.join(homedir(), ".local", "bin", command);
  return existsSync(local) ? local : undefined;
};

export const exec = async (args: string[]): Promise<number> => {
  const [command, ...rest] = args;
  if (!command) {
    throw new CliError("missing command", {
      exitCode: 2,
      hint: "Usage: nipa exec <command> [args...]",
    });
  }
  const bin = resolve(command);
  if (!bin) {
    throw new CliError(`command not found: ${command}`, {
      exitCode: 127,
      hint: INSTALL_HINTS.get(command),
    });
  }
  const [config, session] = await Promise.all([loadConfig(), requireSession()]);

  const child = Bun.spawn([bin, ...rest], {
    env: childEnv(process.env, sessionEnv(config, session)),
    stdio: ["inherit", "inherit", "inherit"],
  });
  // The terminal already sends Ctrl-C to the child. Handling SIGINT here keeps
  // nipa alive until the child exits, so terraform can finish cleanly.
  let interrupted = false;
  const onInterrupt = () => {
    interrupted = true;
  };
  const onTerminate = () => child.kill("SIGTERM");
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  const code = await child.exited;
  process.off("SIGINT", onInterrupt);
  process.off("SIGTERM", onTerminate);

  // Shell convention: killed by signal N exits with 128 + N.
  if (child.signalCode) {
    return 128 + constants.signals[child.signalCode];
  }
  return interrupted && code === 0 ? 128 + constants.signals.SIGINT : code;
};

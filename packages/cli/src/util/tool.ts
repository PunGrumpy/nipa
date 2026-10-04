import { spawn } from "node:child_process";
import { once } from "node:events";
import { constants } from "node:os";

import { childEnv, findCommand, sessionEnv } from "./env";
import type { SignedIn } from "./session";
import { CliError } from "./ui";

const INSTALL_HINTS = new Map([
  ["openstack", "Install it with `pipx install python-openstackclient`."],
  ["terraform", "Install it with `brew install hashicorp/tap/terraform`."],
]);

/**
 * Runs a program with the session's OS_* variables and returns its exit
 * code: `nipa os`, `nipa tf` and `nipa exec`. `signIn` runs only after nipa
 * finds the program, so a missing one never asks for a password.
 */
export const runTool = async ({
  args,
  command,
  signIn,
}: {
  args: readonly string[];
  command: string;
  signIn: () => Promise<SignedIn>;
}): Promise<number> => {
  const bin = findCommand(command);
  if (!bin) {
    throw new CliError(`command not found: ${command}`, {
      exitCode: 127,
      hint: INSTALL_HINTS.get(command),
    });
  }
  const { active, session } = await signIn();
  const child = spawn(bin, args, {
    env: childEnv(
      process.env,
      sessionEnv({ profile: active.profile, session })
    ),
    stdio: "inherit",
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
  await once(child, "exit");
  process.off("SIGINT", onInterrupt);
  process.off("SIGTERM", onTerminate);

  const { exitCode, signalCode } = child;
  if (signalCode) {
    return 128 + constants.signals[signalCode];
  }
  return interrupted && exitCode === 0
    ? 128 + constants.signals.SIGINT
    : (exitCode ?? 1);
};

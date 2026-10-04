import { detectShell, formatEnv, sessionEnv } from "../../lib/env";
import { handle } from "../../util/command";
import { envCommand } from "./command";

export const env = handle(envCommand, async ({ client, flags }) => {
  const shell = flags.shell ?? detectShell(process.env.SHELL);
  const { active, session } = await client.session();
  client.stdout.line(
    formatEnv(sessionEnv({ profile: active.profile, session }), shell)
  );
  return 0;
});

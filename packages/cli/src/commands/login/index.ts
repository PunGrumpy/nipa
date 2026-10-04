import { interactiveLogin } from "../../lib/session";
import { handle } from "../../util/command";
import { loginCommand } from "./command";

export const login = handle(loginCommand, async ({ client, flags }) => {
  await interactiveLogin({
    active: await client.profile(),
    prompts: client.prompts,
    username: flags.username,
    wantedProject: flags.project,
  });
  return 0;
});

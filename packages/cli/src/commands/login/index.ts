import { handle } from "../../util/command";
import { interactiveLogin } from "../../util/session";
import { loginCommand } from "./command";

export const login = handle(loginCommand, async ({ client, flags }) => {
  await interactiveLogin({
    active: await client.profile(),
    prompts: client.prompts,
    remember: flags.remember,
    username: flags.username,
    wantedProject: flags.project,
  });
  return 0;
});

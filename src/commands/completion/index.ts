import { handle } from "../../util/command";
import { completionScript } from "../../util/completion";
import { completionCommand } from "./command";

export const completion = handle(completionCommand, ({ args, client }) => {
  client.stdout.write(
    completionScript({ program: client.program, shell: args.shell })
  );
  return Promise.resolve(0);
});

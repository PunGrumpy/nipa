import { runTool } from "../../lib/tool";
import { forward } from "../../util/command";
import { osCommand } from "./command";

export const os = forward(osCommand, ({ args, client, command }) =>
  runTool({ args, command, signIn: client.cloud })
);

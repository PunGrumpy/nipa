import { forward } from "../../util/command";
import { runTool } from "../../util/tool";
import { osCommand } from "./command";

export const os = forward(osCommand, ({ args, client, command }) =>
  runTool({ args, command, signIn: client.cloud })
);

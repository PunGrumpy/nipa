import { runTool } from "../../lib/tool";
import { forward } from "../../util/command";
import { tfCommand } from "./command";

export const tf = forward(tfCommand, ({ args, client, command }) =>
  runTool({ args, command, signIn: client.cloud })
);

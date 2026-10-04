import { forward } from "../../util/command";
import { runTool } from "../../util/tool";
import { tfCommand } from "./command";

export const tf = forward(tfCommand, ({ args, client, command }) =>
  runTool({ args, command, signIn: client.cloud })
);

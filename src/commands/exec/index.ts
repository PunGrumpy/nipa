import { runTool } from "../../lib/tool";
import { forward } from "../../util/command";
import { execCommand } from "./command";

export const exec = forward(execCommand, ({ args, client, command }) =>
  runTool({ args, command, signIn: client.cloud })
);

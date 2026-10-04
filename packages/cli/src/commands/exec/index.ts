import { forward } from "../../util/command";
import { runTool } from "../../util/tool";
import { execCommand } from "./command";

export const exec = forward(execCommand, ({ args, client, command }) =>
  runTool({ args, command, signIn: client.cloud })
);

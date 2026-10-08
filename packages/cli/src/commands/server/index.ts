import { route } from "../../util/command";
import { serverCommand } from "./command";
import { history } from "./history";
import { inspect } from "./inspect";
import { logs } from "./logs";
import { ls } from "./ls";
import { restart, start, stop } from "./power";

export const server = route(serverCommand, {
  history,
  inspect,
  logs,
  ls,
  restart,
  start,
  stop,
});

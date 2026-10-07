import { route } from "../../util/command";
import { serverCommand } from "./command";
import { history } from "./history";
import { inspect } from "./inspect";
import { ls } from "./ls";
import { restart, start, stop } from "./power";

export const server = route(serverCommand, {
  history,
  inspect,
  ls,
  restart,
  start,
  stop,
});

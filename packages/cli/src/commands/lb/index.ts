import { route } from "../../util/command";
import { lbCommand } from "./command";
import { inspect } from "./inspect";
import { ls } from "./ls";

export const lb = route(lbCommand, { inspect, ls });

import { route } from "../../util/command";
import { sgCommand } from "./command";
import { inspect } from "./inspect";
import { ls } from "./ls";

export const sg = route(sgCommand, { inspect, ls });

import { route } from "../../util/command";
import { dbCommand } from "./command";
import { inspect } from "./inspect";
import { ls } from "./ls";

export const db = route(dbCommand, { inspect, ls });

import { route } from "../../util/command";
import { lbCommand } from "./command";
import { ls } from "./ls";

export const lb = route(lbCommand, { ls });

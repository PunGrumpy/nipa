import { route } from "../../util/command";
import { ipCommand } from "./command";
import { ls } from "./ls";

export const ip = route(ipCommand, { ls });

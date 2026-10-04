import { route } from "../../util/command";
import { serverCommand } from "./command";
import { ls } from "./ls";

export const server = route(serverCommand, { ls });

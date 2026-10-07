import { route } from "../../util/command";
import { networkCommand } from "./command";
import { ls } from "./ls";

export const network = route(networkCommand, { ls });

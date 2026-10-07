import { route } from "../../util/command";
import { flavorCommand } from "./command";
import { ls } from "./ls";

export const flavor = route(flavorCommand, { ls });

import { route } from "../../util/command";
import { sgCommand } from "./command";
import { ls } from "./ls";

export const sg = route(sgCommand, { ls });

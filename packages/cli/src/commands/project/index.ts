import { route } from "../../util/command";
import { projectCommand } from "./command";
import { ls } from "./ls";

export const project = route(projectCommand, { ls });

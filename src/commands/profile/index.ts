import { route } from "../../util/command";
import { add } from "./add";
import { profileCommand } from "./command";
import { ls } from "./ls";
import { rm } from "./rm";
import { use } from "./use";

export const profile = route(profileCommand, { add, ls, rm, use });

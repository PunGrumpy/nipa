import { route } from "../../util/command";
import { volumeCommand } from "./command";
import { ls } from "./ls";

export const volume = route(volumeCommand, { ls });

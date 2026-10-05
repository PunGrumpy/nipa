import { route } from "../../util/command";
import { dbCommand } from "./command";
import { ls } from "./ls";

export const db = route(dbCommand, { ls });

import { route } from "../../util/command";
import { quotaCommand } from "./command";
import { ls } from "./ls";

export const quota = route(quotaCommand, { ls });

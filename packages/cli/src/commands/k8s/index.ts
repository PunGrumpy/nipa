import { route } from "../../util/command";
import { k8sCommand } from "./command";
import { ls } from "./ls";

export const k8s = route(k8sCommand, { ls });

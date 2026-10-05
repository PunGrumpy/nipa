import pkg from "../../../package.json" with { type: "json" };
import { handle } from "../../util/command";
import { completionScript } from "../../util/completion";
import {
  detectShell,
  installCompletion,
  tildify,
  zshLoadsZfunc,
} from "../../util/completion-install";
import { log, success, usageError } from "../../util/ui";
import { completionCommand } from "./command";

export const completion = handle(
  completionCommand,
  async ({ args, client, flags }) => {
    const shell = args.shell ?? detectShell();
    if (!shell) {
      throw usageError(
        "missing <shell>",
        "Pass bash, zsh, fish or pwsh, such as `nipa completion zsh`."
      );
    }
    if (!flags.install) {
      client.stdout.write(completionScript({ program: client.program, shell }));
      return 0;
    }
    if (shell === "pwsh") {
      throw usageError(
        "can't install the completion for pwsh",
        "PowerShell has no completion folder. Add `nipa completion pwsh | Out-String | Invoke-Expression` to your $PROFILE."
      );
    }
    const file = await installCompletion({
      program: client.program,
      shell,
      version: pkg.version,
    });
    success(`Installed the ${shell} completion in ${tildify(file)}`);
    if (shell === "zsh" && !(await zshLoadsZfunc())) {
      log(
        "Add `fpath=(~/.zfunc $fpath)` to ~/.zshrc before `compinit`, then open a new terminal."
      );
    } else if (shell === "bash") {
      log(
        "Open a new terminal to use it. It needs the bash-completion package."
      );
    } else {
      log("Open a new terminal to use it.");
    }
    return 0;
  }
);

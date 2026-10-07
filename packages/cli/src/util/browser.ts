import { spawn } from "node:child_process";
import { once } from "node:events";

import { CliError } from "./ui";

/** The program that opens a URL in the default browser, and its arguments. */
export interface Opener {
  readonly command: string;
  readonly args: readonly string[];
  /** Passes `args` to cmd.exe as they are, which `start` needs. */
  readonly verbatim?: true;
}

export const openerFor = (platform: NodeJS.Platform, url: string): Opener => {
  switch (platform) {
    case "darwin": {
      return { args: [url], command: "open" };
    }
    case "win32": {
      // start reads its first quoted word as a window title, and cmd.exe
      // splits the line at &.
      return {
        args: ["/c", "start", '""', url.replaceAll("&", "^&")],
        command: "cmd",
        verbatim: true,
      };
    }
    default: {
      return { args: [url], command: "xdg-open" };
    }
  }
};

export type Launch = (opener: Opener) => Promise<void>;

/** Starts the opener and leaves it running, so nipa can exit before the browser does. */
const launchDetached: Launch = async ({ args, command, verbatim }) => {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsVerbatimArguments: verbatim,
  });
  await once(child, "spawn");
  child.unref();
};

export const openInBrowser = async (
  url: string,
  options: { platform?: NodeJS.Platform; launch?: Launch } = {}
): Promise<void> => {
  const opener = openerFor(options.platform ?? process.platform, url);
  const launch = options.launch ?? launchDetached;
  try {
    await launch(opener);
  } catch {
    throw new CliError(`couldn't open a browser with ${opener.command}`, {
      hint: "Open the URL above in your browser, or add `--url` to print only the URL.",
    });
  }
};

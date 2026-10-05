// `nipa completion --install`: writes the script where the shell loads it on
// its own, so no startup file runs nipa. nipa records each install and
// rewrites the script when its version changes, because a saved script
// doesn't know about later commands.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { z } from "zod";

import { completionScript } from "./completion";
import type { CompletionShell } from "./completion";
import { debug } from "./http";
import type { ProgramSpec } from "./spec";
import { readCache, writeCache } from "./store";

/** The shells with a directory they load completions from. */
const InstallShellSchema = z.enum(["bash", "zsh", "fish"]);

export type InstallShell = z.infer<typeof InstallShellSchema>;

const CACHE_FILE = "completion.json";

const InstallSchema = z.object({ path: z.string(), version: z.string() });

const InstallsSchema = z.partialRecord(InstallShellSchema, InstallSchema);

/** The shell in $SHELL, when nipa has a script for it. */
export const detectShell = (
  env: NodeJS.ProcessEnv = process.env
): CompletionShell | undefined => {
  const name = path.basename(env.SHELL ?? "");
  switch (name) {
    case "bash":
    case "zsh":
    case "fish":
    case "pwsh": {
      return name;
    }
    default: {
      return undefined;
    }
  }
};

const home = (env: NodeJS.ProcessEnv): string => env.HOME ?? homedir();

/** Where each shell loads a command's completion from. */
export const installPath = (
  shell: InstallShell,
  env: NodeJS.ProcessEnv = process.env
): string => {
  switch (shell) {
    case "zsh": {
      return path.join(env.ZDOTDIR ?? home(env), ".zfunc", "_nipa");
    }
    case "bash": {
      const data = env.XDG_DATA_HOME ?? path.join(home(env), ".local", "share");
      return path.join(data, "bash-completion", "completions", "nipa");
    }
    case "fish": {
      const config = env.XDG_CONFIG_HOME ?? path.join(home(env), ".config");
      return path.join(config, "fish", "completions", "nipa.fish");
    }
    default: {
      const _exhaustive: never = shell;
      return _exhaustive;
    }
  }
};

/** ~/.zfunc/_nipa instead of /Users/me/.zfunc/_nipa. */
export const tildify = (
  file: string,
  env: NodeJS.ProcessEnv = process.env
): string => {
  const dir = home(env);
  return file.startsWith(`${dir}/`) ? `~${file.slice(dir.length)}` : file;
};

/**
 * Whether ~/.zshrc puts ~/.zfunc on $fpath. A check of the file, because
 * nipa can't see the $fpath of the shell that runs it.
 */
export const zshLoadsZfunc = async (
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> => {
  const zshrc = path.join(env.ZDOTDIR ?? home(env), ".zshrc");
  try {
    const text = await readFile(zshrc, "utf-8");
    return text.includes(".zfunc");
  } catch {
    return false;
  }
};

const writeScript = async (input: {
  file: string;
  program: ProgramSpec;
  shell: InstallShell;
}): Promise<void> => {
  await mkdir(path.dirname(input.file), { recursive: true });
  await writeFile(
    input.file,
    completionScript({ program: input.program, shell: input.shell })
  );
};

/** Writes the script for `shell` and records it. Returns where it went. */
export const installCompletion = async (input: {
  program: ProgramSpec;
  shell: InstallShell;
  version: string;
}): Promise<string> => {
  const file = installPath(input.shell);
  await writeScript({ file, program: input.program, shell: input.shell });
  const installs = (await readCache(CACHE_FILE, InstallsSchema)) ?? {};
  await writeCache(CACHE_FILE, {
    ...installs,
    [input.shell]: { path: file, version: input.version },
  });
  return file;
};

const refresh = async (input: {
  program: ProgramSpec;
  version: string;
}): Promise<void> => {
  const installs = await readCache(CACHE_FILE, InstallsSchema);
  if (!installs) {
    return;
  }
  const stale = InstallShellSchema.options.flatMap((shell) => {
    const install = installs[shell];
    return install && install.version !== input.version
      ? [{ file: install.path, shell }]
      : [];
  });
  if (stale.length === 0) {
    return;
  }
  await Promise.all(
    stale.map(({ file, shell }) =>
      writeScript({ file, program: input.program, shell })
    )
  );
  const refreshed = stale.map(({ file, shell }) => [
    shell,
    { path: file, version: input.version },
  ]);
  await writeCache(CACHE_FILE, {
    ...installs,
    ...Object.fromEntries(refreshed),
  });
};

/**
 * Rewrites each recorded script that an older or newer nipa wrote. It never
 * fails a command: when a write fails, the next run tries again.
 */
export const refreshCompletions = async (input: {
  program: ProgramSpec;
  version: string;
}): Promise<void> => {
  try {
    await refresh(input);
  } catch (error) {
    debug(
      `can't refresh the completion scripts: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

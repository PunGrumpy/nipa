#!/usr/bin/env bun

import pkg from "../package.json" with { type: "json" };
import { createCommands, MAIN_EXAMPLES } from "./commands/registry";
import { commandHelp, mainHelp } from "./lib/help";
import { NetworkError } from "./lib/http";
import { KeystoneError } from "./lib/keystone";
import { isPassthrough } from "./lib/spec";
import { StoreError } from "./lib/store";
import { CliError, printError } from "./lib/ui";

interface GlobalOptions {
  profile?: string;
  help: boolean;
  version: boolean;
}

const usageError = (
  message: string,
  hint = "Run `nipa --help` to see the options."
) => new CliError(message, { exitCode: 2, hint });

/**
 * Takes the global options out of `args` and returns the other words. With
 * `untilCommand`, stops at the first word that isn't an option.
 */
const takeGlobals = (input: {
  args: readonly string[];
  options: GlobalOptions;
  untilCommand: boolean;
}): string[] => {
  const { args, options } = input;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (input.untilCommand && !arg.startsWith("-")) {
      return [...rest, ...args.slice(i)];
    }
    switch (arg) {
      case "-P":
      case "--profile": {
        const value = args[i + 1];
        if (value === undefined || value.startsWith("-")) {
          throw usageError(`${arg} needs a profile name`);
        }
        options.profile = value;
        i += 1;
        break;
      }
      case "-h":
      case "--help": {
        options.help = true;
        break;
      }
      case "-v":
      case "--version": {
        options.version = true;
        break;
      }
      // picocolors reads --no-color from process.argv itself.
      case "--no-color": {
        break;
      }
      default: {
        if (arg.startsWith("--profile=")) {
          options.profile = arg.slice("--profile=".length);
        } else if (input.untilCommand) {
          throw usageError(`unknown option "${arg}"`);
        } else {
          rest.push(arg);
        }
      }
    }
  }
  return rest;
};

const main = async (argv: readonly string[]): Promise<number> => {
  const commands = createCommands();
  const options: GlobalOptions = { help: false, version: false };
  const [word, ...afterCommand] = takeGlobals({
    args: argv,
    options,
    untilCommand: true,
  });
  if (options.version) {
    console.log(pkg.version);
    return 0;
  }
  if (word === undefined || word === "help") {
    const topic = word === "help" ? afterCommand[0] : undefined;
    const command = commands.find((c) => c.name === topic);
    console.log(
      command
        ? commandHelp(command)
        : mainHelp({
            examples: MAIN_EXAMPLES,
            specs: commands,
            version: pkg.version,
          })
    );
    return 0;
  }
  const command = commands.find(
    (c) => c.name === word || c.aliases?.includes(word)
  );
  if (!command) {
    throw new CliError(`unknown command "${word}"`, {
      exitCode: 2,
      hint: "Run `nipa --help` to see the commands.",
    });
  }
  // Words after os, tf and exec belong to that program, including --help.
  const args = isPassthrough(command)
    ? afterCommand
    : takeGlobals({ args: afterCommand, options, untilCommand: false });
  if (options.help) {
    console.log(commandHelp(command));
    return 0;
  }
  return await command.run({
    args,
    globals: { profile: options.profile },
  });
};

/** node:util parseArgs throws a TypeError with an ERR_PARSE_ARGS_* code for bad options. */
const isUsageError = (error: Error): boolean =>
  error instanceof TypeError &&
  "code" in error &&
  String(error.code).startsWith("ERR_PARSE_ARGS");

const toCliError = (error: Error): CliError | undefined => {
  if (error instanceof CliError) {
    return error;
  }
  if (error instanceof KeystoneError) {
    return new CliError(error.message);
  }
  if (error instanceof NetworkError) {
    return new CliError(error.message, {
      hint: "Check the Keystone URL with `nipa profile ls`, or your network connection.",
    });
  }
  if (error instanceof StoreError) {
    return new CliError(error.message, {
      hint: "Fix the file, or delete it and run `nipa login` again.",
    });
  }
  if (isUsageError(error)) {
    return usageError(error.message);
  }
  return undefined;
};

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  const cliError = error instanceof Error ? toCliError(error) : undefined;
  if (!cliError) {
    throw error;
  }
  printError(cliError);
  process.exitCode = cliError.exitCode;
}

#!/usr/bin/env bun

import pkg from "../package.json" with { type: "json" };
import {
  completeProjects,
  completion,
  completionUsage,
} from "./commands/completion";
import { exec, execUsage } from "./commands/exec";
import { login, loginUsage } from "./commands/login";
import {
  env,
  envUsage,
  logout,
  logoutUsage,
  switchProject,
  switchUsage,
  whoami,
  whoamiUsage,
} from "./commands/session";
import { isPassthrough } from "./lib/completion";
import type { CommandSpec } from "./lib/completion";
import { SHELLS } from "./lib/env";
import { KeystoneError } from "./lib/keystone";
import { StoreError } from "./lib/store";
import { bold, CliError, dim, printError } from "./lib/ui";

interface Command extends CommandSpec {
  usage: string;
  run: (args: string[]) => Promise<number>;
}

const commands: Command[] = [
  {
    flags: [
      {
        description: "log in as this user",
        long: "username",
        short: "u",
        value: { kind: "text", name: "email" },
      },
      {
        description: "scope to this project",
        long: "project",
        short: "p",
        value: { kind: "project" },
      },
    ],
    name: "login",
    run: async (args) => {
      await login(args);
      return 0;
    },
    summary: "Log in with your password and an OTP code",
    usage: loginUsage,
  },
  {
    name: "logout",
    run: logout,
    summary: "Revoke the token and forget the session",
    usage: logoutUsage,
  },
  {
    flags: [
      { description: "print JSON", long: "json", value: { kind: "none" } },
    ],
    name: "whoami",
    run: whoami,
    summary: "Show the user, project and session expiry",
    usage: whoamiUsage,
  },
  {
    args: { kind: "projects" },
    name: "switch",
    run: switchProject,
    summary: "Use another project",
    usage: switchUsage,
  },
  {
    aliases: ["openstack"],
    args: { kind: "program", program: "openstack" },
    name: "os",
    run: (args) => exec(["openstack", ...args]),
    summary: "Run openstack with the session",
    usage:
      "Usage: nipa os <args...>\n\nShort for `nipa exec openstack <args...>`.\n",
  },
  {
    aliases: ["terraform"],
    args: { kind: "program", program: "terraform" },
    name: "tf",
    run: (args) => exec(["terraform", ...args]),
    summary: "Run terraform with the session",
    usage:
      "Usage: nipa tf <args...>\n\nShort for `nipa exec terraform <args...>`.\n",
  },
  {
    args: { kind: "command" },
    name: "exec",
    run: exec,
    summary: "Run any command with the session",
    usage: execUsage,
  },
  {
    flags: [
      {
        description: "shell syntax to print",
        long: "shell",
        value: { choices: SHELLS, kind: "choice" },
      },
    ],
    name: "env",
    run: env,
    summary: "Print the OS_* variables for your shell",
    usage: envUsage,
  },
  {
    args: { kind: "shells" },
    name: "completion",
    run: (args) => completion(args, commands),
    summary: "Print the tab completion script for your shell",
    usage: completionUsage,
  },
  {
    hidden: true,
    name: "__complete",
    run: completeProjects,
    summary: "Values for completion scripts",
    usage: "Usage: nipa __complete projects\n",
  },
];

const HELP_FLAGS = new Set(["-h", "--help"]);

const findCommand = (word: string): Command | undefined =>
  commands.find((c) => c.name === word || c.aliases?.includes(word));

const help = (): string => {
  const list = commands
    .filter((c) => !c.hidden)
    .map((c) => `    ${c.name.padEnd(11)} ${c.summary}`)
    .join("\n");
  const version = dim(`v${pkg.version}`);
  return `
  ${bold("nipa")} ${version}

  Log in to Nipa Cloud once, then run openstack and terraform with the session.

  ${dim("Usage:")} nipa <command> [options]

  ${dim("Commands:")}
${list}

  ${dim("Examples:")}
    nipa login
    nipa os server list
    nipa tf plan
    nipa switch my-project

  Run ${bold("nipa <command> --help")} for a command's options.
`;
};

const main = async (argv: string[]): Promise<number> => {
  const [first, ...args] = argv;
  if (first === undefined || first === "help" || HELP_FLAGS.has(first)) {
    console.log(help());
    return 0;
  }
  if (first === "-v" || first === "--version") {
    console.log(pkg.version);
    return 0;
  }
  const command = findCommand(first);
  if (!command) {
    throw new CliError(`unknown command "${first}"`, {
      exitCode: 2,
      hint: "Run `nipa --help` to see the commands.",
    });
  }
  if (!isPassthrough(command) && args.some((a) => HELP_FLAGS.has(a))) {
    console.log(command.usage);
    return 0;
  }
  return await command.run(args);
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
  if (error instanceof StoreError) {
    return new CliError(error.message, {
      hint: "Fix the file, or delete it and run `nipa login` again.",
    });
  }
  if (isUsageError(error)) {
    return new CliError(error.message, { exitCode: 2 });
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

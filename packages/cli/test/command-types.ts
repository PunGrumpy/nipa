// Type-level checks for the command model. `bun run typecheck` checks this
// file. `bun test` skips it: its name doesn't end in .test.ts.

import type { completeCommand } from "../src/commands/complete/command";
import { envCommand } from "../src/commands/env/command";
import { add } from "../src/commands/profile/add";
import type { addSubcommand } from "../src/commands/profile/command";
import { profileCommand, rmSubcommand } from "../src/commands/profile/command";
import { ls as profileLs } from "../src/commands/profile/ls";
import { rm } from "../src/commands/profile/rm";
import { lsSubcommand, serverCommand } from "../src/commands/server/command";
import { ls } from "../src/commands/server/ls";
import type { GlobalValues } from "../src/util/arg-common";
import { defineCommand, defineGroup, handle, route } from "../src/util/command";
import type { Input } from "../src/util/spec";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

// The handler's input comes from the spec, and only from the spec.
export const derived: [
  Equal<keyof Input<typeof lsSubcommand>["args"], never>,
  Equal<Input<typeof lsSubcommand>["flags"], { readonly json?: true }>,
  Equal<
    Input<typeof rmSubcommand>,
    {
      readonly args: { readonly name: string };
      readonly flags: { readonly yes?: true };
    }
  >,
  Equal<
    Input<typeof addSubcommand>,
    {
      readonly args: { readonly name: string | undefined };
      readonly flags: {
        readonly "auth-url"?: string;
        readonly region?: string;
        readonly use?: true;
        readonly "user-domain"?: string;
      };
    }
  >,
  Equal<
    Input<typeof envCommand>["flags"],
    { readonly shell?: "bash" | "zsh" | "fish" }
  >,
  Equal<
    Input<typeof completeCommand>["args"],
    {
      readonly kind: "projects" | "profiles" | "openstack";
      readonly words: readonly string[];
    }
  >,
  Equal<
    GlobalValues,
    {
      readonly debug?: true;
      readonly help?: true;
      readonly "no-color"?: true;
      readonly profile?: string;
      readonly version?: true;
    }
  >,
] = [true, true, true, true, true, true, true];

// The handler table can't drift from command.ts.

// @ts-expect-error a subcommand without a handler
export const missing = route(profileCommand, { add, ls: profileLs, rm });

export const extra = route(serverCommand, {
  ls,
  // @ts-expect-error a handler without a subcommand
  rm,
});

export const crossed = route(profileCommand, {
  add,
  ls: profileLs,
  rm,
  // @ts-expect-error a handler bound to another subcommand's spec
  use: rm,
});

export const badDefault = defineGroup({
  // @ts-expect-error the default must name a subcommand
  default: "list",
  name: "server",
  subcommands: [lsSubcommand],
  summary: "Servers",
});

export const typo = handle(rmSubcommand, ({ flags }) =>
  // @ts-expect-error a flag the spec doesn't declare
  Promise.resolve(flags.force ? 0 : 1)
);

// A choice's words type the handler. A word outside them doesn't compile.
export const choice = handle(envCommand, ({ flags }) =>
  // @ts-expect-error "tcsh" isn't one of the choices
  Promise.resolve(flags.shell === "tcsh" ? 0 : 1)
);

// A misspelled key doesn't compile, though the literal is captured.
export const misspelled = defineCommand({
  // @ts-expect-error `alias` isn't a key; `aliases` is
  alias: ["list"],
  args: [],
  flags: [],
  name: "ls",
  summary: "x",
});

// A leaf must declare its args and flags, even when there are none.
// @ts-expect-error `args` is missing
export const bare = defineCommand({ flags: [], name: "x", summary: "x" });

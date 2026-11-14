// The Model Context Protocol server behind `nipa mcp`. It speaks JSON-RPC over
// stdin and stdout, so nothing else may write to stdout while it runs: a
// message, a spinner or a prompt there would break the framing. Those go to
// stderr, and nothing here ever prompts, because stdin is the protocol.
//
// Only src/commands/mcp imports this module, and it does so lazily, so the
// SDK's code is read by `nipa mcp` alone.

import { once } from "node:events";
import { setImmediate as nextTurn } from "node:timers/promises";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type {
  CallToolResult,
  Tool as ProtocolTool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { internalError, jsonErrorDocument, toCliError } from "./errors";
import type { ErrorDocument } from "./errors";
import { debug } from "./http";
import { TOOLS, ToolArgumentsSchema } from "./mcp-tools";
import type { RegisteredTool, ToolArguments, ToolContext } from "./mcp-tools";
import { runScope } from "./scope";
import { connect, requireSession, requireSpaceUrl } from "./session";
import type { ActiveProfile } from "./session";
import { createPrompts } from "./ui";

/**
 * The profile chosen when the server starts, and the session, read on each
 * call so that a `nipa login` in another terminal takes effect without a
 * restart. The
 * prompts say they can't ask, so an expired session is an error.
 */
export const createToolContext = (input: {
  active: ActiveProfile;
  /** The run's `-p`. A tool's own `project` replaces it. */
  project: string | undefined;
}): ToolContext => {
  const { active } = input;
  const prompts = createPrompts({
    env: process.env,
    json: true,
    nonInteractive: true,
    stderr: process.stderr,
    stdin: process.stdin,
  });
  return {
    cloud: async (project) => {
      const signedIn = await requireSession({
        active,
        project: project ?? input.project,
        prompts,
      });
      return connect({ signedIn, spaceUrl: requireSpaceUrl(active) });
    },
    profile: () => Promise.resolve(active),
    project: input.project,
    savedSession: () => requireSession({ active, prompts, saved: true }),
  };
};

const READ_ONLY = {
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
  readOnlyHint: true,
} as const;

const describeTool = (tool: RegisteredTool): ProtocolTool => ({
  annotations: READ_ONLY,
  description: tool.description,
  inputSchema: ToolSchema.shape.inputSchema.parse(
    z.toJSONSchema(tool.input, { io: "input" })
  ),
  name: tool.name,
});

const LOGIN_REASONS = new Set(["login_required", "token_expired"]);

const failure = (document: ErrorDocument): CallToolResult => ({
  content: [{ text: JSON.stringify(document, null, 2), type: "text" }],
  isError: true,
});

/**
 * The machine error document `--json` writes, for any error a tool throws. A
 * session that needs a login says so for the person, since the assistant
 * can't run `nipa login`: it asks for a password and a code.
 */
export const errorDocument = (error: Error): ErrorDocument => {
  if (error instanceof z.ZodError) {
    return {
      message: `invalid input: ${z.prettifyError(error)}`,
      reason: "invalid_arguments",
      status: "error",
    };
  }
  const cliError = toCliError(error);
  if (!cliError) {
    debug(error.stack ?? error.message);
    return jsonErrorDocument(internalError());
  }
  const document = jsonErrorDocument(cliError, runScope());
  if (LOGIN_REASONS.has(document.reason)) {
    const login = document.next?.[0]?.command ?? "nipa login";
    return {
      ...document,
      hint: `Ask the user to run \`${login}\` in a terminal, then call the tool again. nipa mcp can't ask for a password or a code.`,
    };
  }
  return document;
};

export const callTool = async (
  ctx: ToolContext,
  call: { name: string; arguments: ToolArguments }
): Promise<CallToolResult> => {
  const tool = TOOLS.find((candidate) => candidate.name === call.name);
  if (!tool) {
    return failure({
      hint: `The tools are ${TOOLS.map((t) => t.name).join(", ")}.`,
      message: `no tool named "${call.name}"`,
      reason: "invalid_arguments",
      status: "error",
    });
  }
  try {
    const document = await tool.run(ctx, call.arguments);
    return {
      content: [{ text: JSON.stringify(document, null, 2), type: "text" }],
    };
  } catch (error) {
    return failure(
      errorDocument(error instanceof Error ? error : new Error(`${error}`))
    );
  }
};

/** Serves the tools on stdin and stdout until the assistant closes the pipe. */
export const serve = async (input: {
  context: ToolContext;
  version: string;
}): Promise<void> => {
  const server = new Server(
    { name: "nipa", version: input.version },
    { capabilities: { tools: {} } }
  );
  const calls = new Set<Promise<CallToolResult>>();
  const track = async (call: Promise<CallToolResult>) => {
    calls.add(call);
    try {
      return await call;
    } finally {
      calls.delete(call);
    }
  };
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: TOOLS.map(describeTool),
  }));
  server.setRequestHandler(CallToolRequestSchema, ({ params }) => {
    const parsed = ToolArgumentsSchema.safeParse(params.arguments ?? {});
    return parsed.success
      ? track(
          callTool(input.context, { arguments: parsed.data, name: params.name })
        )
      : failure(errorDocument(parsed.error));
  });
  await server.connect(new StdioServerTransport());
  // The assistant ends the pipe to stop the server, which is not an error.
  // `printf ... | nipa mcp` ends it right after the last request, so the
  // calls still running get to answer first.
  await once(process.stdin, "end");
  await Promise.allSettled(calls);
  await nextTurn();
  await server.close();
};

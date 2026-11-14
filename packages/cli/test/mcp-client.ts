// A minimal Model Context Protocol client for process tests: it starts
// `nipa mcp`, sends one JSON-RPC message per line and reads the replies. It
// keeps every raw line of stdout, so a test can check that nothing but
// protocol frames came out.

import { z } from "zod";

import { ENTRY } from "./helpers";

const JsonSchema = z.json();

export type Json = z.infer<typeof JsonSchema>;

/** The arguments of a call or a request. */
export type Params = Readonly<Record<string, Json>>;

const FrameSchema = z.looseObject({
  error: z.looseObject({ code: z.number(), message: z.string() }).optional(),
  id: z.number().optional(),
  jsonrpc: z.literal("2.0"),
  result: JsonSchema.optional(),
});

export type Frame = z.infer<typeof FrameSchema>;

const ToolResultSchema = z.object({
  content: z.array(z.object({ text: z.string(), type: z.literal("text") })),
  isError: z.boolean().optional(),
});

const InitializeSchema = z.object({
  capabilities: z.object({ tools: z.object({}).loose() }),
  protocolVersion: z.string(),
  serverInfo: z.object({ name: z.string(), version: z.string() }),
});

const ToolListSchema = z.object({
  tools: z.array(
    z.looseObject({
      annotations: z.looseObject({ readOnlyHint: z.boolean() }),
      description: z.string(),
      inputSchema: z.looseObject({ type: z.literal("object") }),
      name: z.string(),
    })
  ),
});

/** What a tool answered: the document it returned, or the error document. */
export interface ToolAnswer {
  isError: boolean;
  /** The JSON text of the answer, parsed. */
  document: Json;
}

export interface McpProcess {
  /** Every line the server wrote to stdout, in order. */
  readonly stdoutLines: string[];
  initialize: () => Promise<z.infer<typeof InitializeSchema>>;
  listTools: () => Promise<z.infer<typeof ToolListSchema>["tools"]>;
  call: (name: string, args?: Params) => Promise<ToolAnswer>;
  /** Sends a request and returns its reply frame as it came. */
  request: (method: string, params?: Params) => Promise<Frame>;
  /** Ends stdin, as an assistant does to stop the server, and waits for the exit. */
  finish: () => Promise<{ code: number; stderr: string }>;
}

export const startMcp = (input: {
  args?: readonly string[];
  /** The program and script to run. The default is the source, on Bun. */
  command?: readonly string[];
  env: Record<string, string>;
}): McpProcess => {
  const command = input.command ?? ["bun", ENTRY];
  const proc = Bun.spawn([...command, ...(input.args ?? []), "mcp"], {
    env: input.env,
    stderr: "pipe",
    stdin: "pipe",
    stdout: "pipe",
  });
  const stdoutLines: string[] = [];
  const waiting = new Map<number, (frame: Frame) => void>();
  const stderr = new Response(proc.stderr).text();
  let nextId = 1;

  const take = (line: string) => {
    stdoutLines.push(line);
    const frame = FrameSchema.parse(JSON.parse(line));
    if (frame.id === undefined) {
      return;
    }
    waiting.get(frame.id)?.(frame);
    waiting.delete(frame.id);
  };

  const reading = (async () => {
    const decoder = new TextDecoder();
    let pending = "";
    for await (const chunk of proc.stdout) {
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        take(line);
      }
    }
    if (pending !== "") {
      take(pending);
    }
  })();

  const send = (message: Params) => {
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
  };

  const request = (method: string, params: Params = {}): Promise<Frame> => {
    const id = nextId;
    nextId += 1;
    const { promise, resolve } = Promise.withResolvers<Frame>();
    waiting.set(id, resolve);
    send({ id, method, params });
    return promise;
  };

  const resultOf = async (method: string, params?: Params) => {
    const frame = await request(method, params);
    if (frame.error) {
      throw new Error(`${method}: ${frame.error.message}`);
    }
    return frame.result;
  };

  return {
    call: async (name, args = {}) => {
      const result = ToolResultSchema.parse(
        await resultOf("tools/call", { arguments: args, name })
      );
      const [first] = result.content;
      return {
        document: JsonSchema.parse(JSON.parse(first?.text ?? "null")),
        isError: result.isError === true,
      };
    },
    finish: async () => {
      await proc.stdin.end();
      const code = await proc.exited;
      await reading;
      return { code, stderr: await stderr };
    },
    initialize: async () => {
      const result = InitializeSchema.parse(
        await resultOf("initialize", {
          capabilities: {},
          clientInfo: { name: "nipa-test", version: "0" },
          protocolVersion: "2025-06-18",
        })
      );
      send({ method: "notifications/initialized" });
      return result;
    },
    listTools: async () =>
      ToolListSchema.parse(await resultOf("tools/list")).tools,
    request,
    stdoutLines,
  };
};

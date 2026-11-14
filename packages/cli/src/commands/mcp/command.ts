import { defineCommand } from "../../util/command";

export const mcpCommand = defineCommand({
  args: [],
  description:
    "Runs a Model Context Protocol server on stdin and stdout, so an AI assistant that you already use, such as Claude Code, Claude Desktop, Cursor or Codex, can read your Nipa Cloud project with your session. The tools only read: they list and inspect servers, volumes, networks, security groups, load balancers, databases, Kubernetes clusters, quotas and flavors, read a server's console log and history, and search servers in every project. Nothing starts, stops, creates or deletes anything. nipa holds no AI key and calls no model. An assistant starts this command itself, so you add it to its configuration. When the session expired, a tool answers with an error that asks you to run `nipa login`, because stdin is the protocol and nipa can't ask. Messages go to stderr, and stdout carries only protocol messages.",
  examples: [
    {
      command: "claude mcp add nipa -- nipa mcp",
      description: "Add nipa to Claude Code",
    },
    {
      command: "claude mcp add nipa -- nipa -P staging mcp",
      description: "Add nipa to Claude Code, reading the staging profile",
    },
    {
      command: "claude mcp add nipa -- nipa -p Beta mcp",
      description: "Add nipa to Claude Code, reading the Beta project",
    },
  ],
  flags: [],
  name: "mcp",
  summary: "Let an AI assistant read your project, read-only",
  // A shell or an assistant reads the output.
  updateNotice: false,
});

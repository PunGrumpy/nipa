<!-- contentType: How-to · plan: docs/content-plan.md -->

# Use nipa with an AI assistant

This page shows how to let an AI assistant that you already use, such as Claude Code, Claude Desktop, Cursor or Codex, read your Nipa Cloud project so it can help you find out why something is down. The assistant reads through the session nipa saved. nipa holds no AI key and calls no model.

You add `nipa mcp` to the assistant once. The assistant starts it when it needs it. The command runs a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server on stdin and stdout, which is how these assistants talk to a local tool.

## Before you start

You need nipa installed and a session, because the assistant can't log in for you:

```sh
nipa login
nipa whoami
```

`nipa whoami` should name your user and project. The assistant starts nipa from a program, not from your shell, so a desktop app may not find a `nipa` that your shell does. If an assistant says it can't start `nipa`, replace `nipa` in its configuration with the path that `which nipa` prints.

## Add nipa to your assistant

Pick the assistant you use. Each one runs `nipa mcp`.

### Claude Code

Run this in a terminal:

```sh
claude mcp add nipa -- nipa mcp
```

This adds nipa for the current project, for you only. To add it for every project, put `--scope user` before the name: `claude mcp add --scope user nipa -- nipa mcp`. Run `claude mcp list` to check that `nipa` is connected.

### Claude Desktop

Add this to `claude_desktop_config.json`, then restart the app:

```json
{
  "mcpServers": {
    "nipa": { "args": ["mcp"], "command": "nipa" }
  }
}
```

### Cursor

Add this to `.cursor/mcp.json` in a project, or to `~/.cursor/mcp.json` for every project:

```json
{
  "mcpServers": {
    "nipa": { "args": ["mcp"], "command": "nipa" }
  }
}
```

### Codex

Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.nipa]
command = "nipa"
args = ["mcp"]
```

## Choose the profile and project

The server reads the profile and project that `nipa server ls` would read in the folder where the assistant starts it. To pin them, put the global options before `mcp`:

```sh
claude mcp add nipa-staging -- nipa -P staging mcp
claude mcp add nipa-beta -- nipa -p Beta mcp
```

`-P` picks the profile, and `-p` picks the project for the whole run without saving it. Every tool except `whoami` also takes a `project`, a name or ID, so the assistant can look at another project for one question. Neither changes the project that `nipa switch` saved. The server reads your session on each call, so a `nipa login` or `nipa switch` in a terminal takes effect without restarting the assistant.

## Ask a question

Ask the assistant about your project in plain words:

- Which of my servers are in an error state, and why?
- Why is web-1 broken?
- Why can't I reach web-1? Check its security groups and its console log.
- Which project has a server with the address 203.0.113.10?
- Is the load balancer for api healthy, and which member is down?
- Am I close to a quota limit?

The assistant picks the tools. For a question like "Why is web-1 broken?", it starts with `investigate`, which runs the same checks as `nipa investigate`: findings with problems first, each with the evidence it read and the nipa commands to run next. For a broader question, it starts with a list, inspects what looks wrong, and reads the history and console log of a server that failed. When a name fits more than one kind, such as a server and a volume called `web-1`, the tool says so and the assistant asks again with the kind.

## What the assistant can and can't do

Every tool reads. Nothing the assistant can call starts, stops, restarts, creates, changes or deletes anything. [MCP tools](cli-reference.md#mcp-tools) lists them and the command each one matches:

- **Servers**: list and inspect them, read the end of a console log (up to 500 lines), list what was done to a server, and search by name, ID or address in every project
- **Network and storage**: list networks, volumes and security groups, and inspect a security group with the rules that open SSH, RDP or a database to the internet
- **Services**: list and inspect load balancers (with a diagnosis of which part is down) and databases, and list Kubernetes clusters
- **Root cause**: investigate a server, load balancer, database, volume or Kubernetes cluster by name or ID, and get what's wrong with it, with the evidence and the commands to run next
- **Account**: show who you're logged in as, the quotas and the flavors

The assistant can't log in, switch your project, run `openstack` or `terraform`, or read your password or token. nipa never puts them in a tool's answer.

To act on what the assistant finds, such as starting a stopped server, you run the command yourself, for example `nipa server start web-1`.

## What the assistant sees

A tool's answer goes to the model behind your assistant, which your assistant's provider runs. That includes server names, addresses, security group rules and the console log. A console log holds whatever the server printed at boot, so check that yours prints nothing secret before you let an assistant read it.

## When the session expires

The assistant gets an error that says the session expired and asks you to run `nipa login`. nipa can't ask for your password or an OTP code, because stdin carries the protocol. Run `nipa login` in a terminal, then ask again. You don't need to restart the assistant.

## Check the server by hand

To see what the assistant sees, send the server the messages an assistant sends. This prints the list of tools:

```sh
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | nipa mcp
```

stdout carries only MCP messages, one JSON document per line. nipa writes its own messages, such as which profile it serves, to stderr, which assistants show in their logs.

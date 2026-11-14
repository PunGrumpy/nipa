import pkg from "../../../package.json" with { type: "json" };
import { handle } from "../../util/command";
import { dim, log, setAnimation } from "../../util/ui";
import { mcpCommand } from "./command";

export const mcp = handle(mcpCommand, async ({ client }) => {
  // The first command in which stdout carries a protocol: no spinner may
  // draw, whatever the terminal says.
  setAnimation(false);
  // Fails here, before the assistant connects, when the profile is unknown.
  const active = await client.profile();
  // The SDK is read only by this command, so every other command starts as fast as before.
  const { createToolContext, serve } = await import("../../util/mcp-server");
  const { TOOLS } = await import("../../util/mcp-tools");
  if (client.prompts.interactive) {
    log(
      "nipa mcp speaks the Model Context Protocol on stdin and stdout, so an AI assistant should start it. See docs/use-with-ai.md for how to add it."
    );
  }
  log(
    `Serving ${TOOLS.length} read-only tools for the ${active.name} profile ${dim("(press Ctrl-C to stop)")}`
  );
  await serve({
    context: createToolContext({ active, project: client.project }),
    version: pkg.version,
  });
  return 0;
});

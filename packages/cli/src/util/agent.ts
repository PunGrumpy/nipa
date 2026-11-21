// The variables an AI coding agent's harness sets for the commands it runs.
// A prompt such a run can't see would hang it, so createPrompts treats it
// like CI. A variable set to an empty string counts as unset.

export const AGENT_VARIABLES = [
  "AI_AGENT",
  "CLAUDECODE",
  "CLAUDE_CODE",
  "CURSOR_AGENT",
  "GEMINI_CLI",
  "CODEX_SANDBOX",
  "CODEX_CI",
  "CODEX_THREAD_ID",
  "ANTIGRAVITY_AGENT",
  "AUGMENT_AGENT",
  "OPENCODE_CLIENT",
] as const;

/** The first agent variable that is set, or undefined when a person runs nipa. */
export const agentVariable = (env: NodeJS.ProcessEnv): string | undefined =>
  AGENT_VARIABLES.find((name) => !!env[name]);

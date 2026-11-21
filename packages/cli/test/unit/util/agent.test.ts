import { describe, expect, test } from "bun:test";

import { AGENT_VARIABLES, agentVariable } from "../../../src/util/agent";

describe("agentVariable", () => {
  test("is undefined when a person runs nipa", () => {
    expect(agentVariable({})).toBeUndefined();
  });

  test("names the variable that is set", () => {
    expect(agentVariable({ CLAUDECODE: "1" })).toBe("CLAUDECODE");
  });

  test("an empty variable counts as unset", () => {
    expect(agentVariable({ CLAUDECODE: "" })).toBeUndefined();
  });

  test("a variable an editor's terminal sets for a person is not an agent", () => {
    expect(agentVariable({ CURSOR_TRACE_ID: "x" })).toBeUndefined();
  });

  test.each([...AGENT_VARIABLES])("%s alone is detected", (name) => {
    expect(agentVariable({ [name]: "1" })).toBe(name);
  });
});

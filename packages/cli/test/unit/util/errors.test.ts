import { describe, expect, test } from "bun:test";

import { ApiError } from "../../../src/util/api";
import {
  internalError,
  jsonErrorDocument,
  toCliError,
} from "../../../src/util/errors";
import type { ErrorDocument, Reason } from "../../../src/util/errors";
import { NetworkError } from "../../../src/util/http";
import { KeystoneError } from "../../../src/util/keystone";
import { StoreError } from "../../../src/util/store";
import { CliError, usageError } from "../../../src/util/ui";

describe("the reason of an error", () => {
  test("is invalid_arguments for exit 2 and failed for anything else", () => {
    expect(usageError("m", "h").reason).toBe("invalid_arguments");
    expect(new CliError("m", { exitCode: 2 }).reason).toBe("invalid_arguments");
    expect(new CliError("m").reason).toBe("failed");
    expect(new CliError("m", { exitCode: 130 }).reason).toBe("failed");
  });

  test("is the one a throw site names", () => {
    expect(usageError("m", "h", "unknown_option").reason).toBe(
      "unknown_option"
    );
    expect(new CliError("m", { reason: "not_found" }).reason).toBe("not_found");
  });

  test.each<[string, Error, Reason]>([
    [
      "a network error",
      new NetworkError("https://x.test/v3", "down"),
      "network_error",
    ],
    ["a store error", new StoreError("bad file"), "invalid_config"],
    ["a Space API 401", new ApiError("no", 401), "token_expired"],
    ["a Space API 404", new ApiError("no", 404), "not_found"],
    ["a Space API 403", new ApiError("no", 403), "api_error"],
    ["a Space API 500", new ApiError("no", 500), "api_error"],
    [
      "a Keystone 401, which a wrong password gets too",
      new KeystoneError("no", 401),
      "api_error",
    ],
    ["a Keystone 404", new KeystoneError("no", 404), "api_error"],
  ])("maps %s", (_name, error, reason) => {
    expect(toCliError(error)?.reason).toBe(reason);
  });

  test("keeps the reason of an error that is already a CliError", () => {
    const error = new CliError("m", { reason: "ambiguous_name" });
    expect(toCliError(error)).toBe(error);
  });
});

describe("jsonErrorDocument", () => {
  test("holds only what applies", () => {
    expect(jsonErrorDocument(new CliError("boom"))).toEqual({
      message: "boom",
      reason: "failed",
      status: "error",
    });
  });

  test("keeps the hint and splits each next command into argv", () => {
    const error = new CliError("you aren't logged in to staging", {
      hint: "Run `nipa login -P staging`.",
      next: ["nipa login -P staging"],
      reason: "login_required",
    });
    expect(jsonErrorDocument(error)).toEqual({
      hint: "Run `nipa login -P staging`.",
      message: "you aren't logged in to staging",
      next: [
        {
          argv: ["nipa", "login", "-P", "staging"],
          command: "nipa login -P staging",
        },
      ],
      reason: "login_required",
      status: "action_required",
    });
  });

  test("leaves next out when it is empty", () => {
    const error = new CliError("m", { next: [] });
    expect(jsonErrorDocument(error)).not.toHaveProperty("next");
  });

  test.each<[string, CliError, ErrorDocument["status"]]>([
    ["a wrong command line", usageError("m", "h"), "action_required"],
    [
      "login_required",
      new CliError("m", { reason: "login_required" }),
      "action_required",
    ],
    [
      "token_expired",
      new CliError("m", { reason: "token_expired" }),
      "action_required",
    ],
    ["not_found", new CliError("m", { reason: "not_found" }), "error"],
    ["network_error", new CliError("m", { reason: "network_error" }), "error"],
    ["internal_error", internalError(), "error"],
  ])("sets the status for %s", (_name, error, status) => {
    expect(jsonErrorDocument(error).status).toBe(status);
  });

  test("names the bug without a stack", () => {
    expect(jsonErrorDocument(internalError())).toEqual({
      message: "Unexpected error in nipa. This is a bug.",
      reason: "internal_error",
      status: "error",
    });
  });
});

describe("next in the error document", () => {
  const error = new CliError("m", { next: ["nipa server ls"] });

  test("keeps the profile the run named", () => {
    expect(jsonErrorDocument(error, "staging").next).toEqual([
      {
        argv: ["nipa", "-P", "staging", "server", "ls"],
        command: "nipa -P staging server ls",
      },
    ]);
  });

  test("stays as written when the run named no profile", () => {
    expect(jsonErrorDocument(error).next?.[0]?.command).toBe("nipa server ls");
  });

  test("doesn't name a profile twice", () => {
    const login = new CliError("m", { next: ["nipa login -P staging"] });
    expect(jsonErrorDocument(login, "staging").next?.[0]?.command).toBe(
      "nipa login -P staging"
    );
  });
});

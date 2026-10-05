import { describe, expect, test } from "bun:test";

import type { CompletionShell } from "../../../src/util/completion";
import {
  detectShell,
  installPath,
  tildify,
} from "../../../src/util/completion-install";

describe("detectShell", () => {
  const shells: [string | undefined, CompletionShell | undefined][] = [
    ["/bin/zsh", "zsh"],
    ["/opt/homebrew/bin/bash", "bash"],
    ["/usr/local/bin/fish", "fish"],
    ["/usr/local/bin/pwsh", "pwsh"],
    ["/bin/tcsh", undefined],
    [undefined, undefined],
  ];

  test.each(shells)("%s -> %s", (shell, expected) => {
    expect(detectShell({ SHELL: shell })).toBe(expected);
  });
});

describe("installPath", () => {
  test("puts each script where its shell loads it", () => {
    const env = { HOME: "/home/me" };
    expect(installPath("zsh", env)).toBe("/home/me/.zfunc/_nipa");
    expect(installPath("bash", env)).toBe(
      "/home/me/.local/share/bash-completion/completions/nipa"
    );
    expect(installPath("fish", env)).toBe(
      "/home/me/.config/fish/completions/nipa.fish"
    );
  });

  test("follows ZDOTDIR and the XDG directories", () => {
    const env = {
      HOME: "/home/me",
      XDG_CONFIG_HOME: "/cfg",
      XDG_DATA_HOME: "/data",
      ZDOTDIR: "/home/me/.config/zsh",
    };
    expect(installPath("zsh", env)).toBe("/home/me/.config/zsh/.zfunc/_nipa");
    expect(installPath("bash", env)).toBe(
      "/data/bash-completion/completions/nipa"
    );
    expect(installPath("fish", env)).toBe("/cfg/fish/completions/nipa.fish");
  });
});

describe("tildify", () => {
  test("shortens paths under HOME only", () => {
    const env = { HOME: "/home/me" };
    expect(tildify("/home/me/.zfunc/_nipa", env)).toBe("~/.zfunc/_nipa");
    expect(tildify("/home/meet/x", env)).toBe("/home/meet/x");
  });
});

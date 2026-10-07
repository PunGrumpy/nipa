import { describe, expect, test } from "bun:test";

import { openInBrowser } from "../../../src/util/browser";
import type { Opener } from "../../../src/util/browser";

const URL = "https://space.nipa.cloud/compute_instances/s1/overview";

const opened = async (platform: NodeJS.Platform, url = URL) => {
  const seen: Opener[] = [];
  await openInBrowser(url, {
    launch: (opener) => {
      seen.push(opener);
      return Promise.resolve();
    },
    platform,
  });
  return seen;
};

describe("openInBrowser", () => {
  test("macOS runs open", async () => {
    expect(await opened("darwin")).toEqual([{ args: [URL], command: "open" }]);
  });

  test("Linux runs xdg-open", async () => {
    expect(await opened("linux")).toEqual([
      { args: [URL], command: "xdg-open" },
    ]);
  });

  test("Windows runs start through cmd, with an empty title and & escaped", async () => {
    expect(await opened("win32", "https://x.test/?a=1&b=2")).toEqual([
      {
        args: ["/c", "start", '""', "https://x.test/?a=1^&b=2"],
        command: "cmd",
        verbatim: true,
      },
    ]);
  });

  test("a missing opener fails with the URL left to open by hand", async () => {
    const attempt = openInBrowser(URL, {
      launch: () => Promise.reject(new Error("spawn xdg-open ENOENT")),
      platform: "linux",
    });
    await expect(attempt).rejects.toThrow(
      "couldn't open a browser with xdg-open"
    );
    await expect(attempt).rejects.toMatchObject({
      hint: "Open the URL above in your browser, or add `--url` to print only the URL.",
    });
  });
});

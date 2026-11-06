import { afterAll, describe, expect, spyOn, test } from "bun:test";

import {
  NetworkError,
  request,
} from "../../../src/util/http";

const seenByTarget: { token: string | null; body: string }[] = [];

const target = Bun.serve({
  fetch: async (req) => {
    seenByTarget.push({
      body: await req.text(),
      token: req.headers.get("X-Auth-Token"),
    });
    return new Response("target");
  },
  port: 0,
});

const gateway = Bun.serve({
  fetch: async (req) => {
    const { pathname } = new URL(req.url);
    if (pathname === "/redirect") {
      return new Response(null, {
        headers: { Location: `http://127.0.0.1:${target.port}/landed` },
        status: 307,
      });
    }
    if (pathname === "/redirect-nowhere") {
      return new Response(null, { status: 302 });
    }
    if (pathname === "/stall") {
      await Bun.sleep(5000);
      return new Response("late");
    }
    return new Response("ok");
  },
  port: 0,
});

const base = `http://127.0.0.1:${gateway.port}`;

const failureOf = async (
  url: string,
  init?: RequestInit
): Promise<NetworkError> => {
  try {
    await request(url, init);
  } catch (error) {
    if (error instanceof NetworkError) {
      return error;
    }
    throw error;
  }
  throw new Error(`${url} didn't fail`);
};

afterAll(async () => {
  await gateway.stop(true);
  await target.stop(true);
});

describe("request", () => {
  test("refuses a redirect and never sends the token or body to its target", async () => {
    seenByTarget.length = 0;
    const error = await failureOf(`${base}/redirect`, {
      body: '{"password":"hunter2"}',
      headers: { "X-Auth-Token": "secret-token" },
      method: "POST",
    });
    expect(error.message).toBe(
      `can't reach 127.0.0.1:${gateway.port}: it redirects to http://127.0.0.1:${target.port}`
    );
    expect(seenByTarget).toEqual([]);
  });

  test("names no target when the redirect has no Location", async () => {
    const error = await failureOf(`${base}/redirect-nowhere`);
    expect(error.message).toContain("it redirects somewhere else");
  });

  test("follows a redirect when the caller asks", async () => {
    seenByTarget.length = 0;
    const res = await request(`${base}/redirect`, { redirect: "follow" });
    expect(await res.text()).toBe("target");
    expect(seenByTarget).toHaveLength(1);
  });

  test("gives up on a stalled server at the caller's signal", async () => {
    const error = await failureOf(`${base}/stall`, {
      signal: AbortSignal.timeout(50),
    });
    expect(error.message).toContain("can't reach");
  });

  test("bounds a request that has no signal", async () => {
    const timeout = spyOn(AbortSignal, "timeout");
    try {
      await request(`${base}/ok`);
      expect(timeout).toHaveBeenCalledWith(30_000);
    } finally {
      timeout.mockRestore();
    }
  });

  test("keeps the caller's signal instead of the default", async () => {
    const timeout = spyOn(AbortSignal, "timeout");
    try {
      await request(`${base}/ok`, { signal: new AbortController().signal });
      expect(timeout).not.toHaveBeenCalled();
    } finally {
      timeout.mockRestore();
    }
  });
});

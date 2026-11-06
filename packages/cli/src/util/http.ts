import pc from "picocolors";

import { formatElapsed, writeStderr } from "./ui";

export const isDebug = (): boolean => process.env.NIPA_DEBUG === "1";

export const debug = (message: string): void => {
  if (isDebug()) {
    writeStderr(pc.dim(`> [debug] [${new Date().toISOString()}] ${message}`));
  }
};

export class NetworkError extends Error {
  readonly url: string;

  constructor(url: string, cause: string) {
    super(`can't reach ${new URL(url).host}: ${cause}`);
    this.name = "NetworkError";
    this.url = url;
  }
}

// Node's fetch throws "fetch failed" and puts the socket error in cause.
const describe = (error: Error): string =>
  error.cause instanceof Error
    ? `${error.message} (${describe(error.cause)})`
    : error.message;

/** How long one request, body included, may take unless the caller says. */
const REQUEST_TIMEOUT_MS = 30_000;

// Where a redirect points, for the error. Never the query: it may hold secrets.
const redirectTarget = (res: Response, url: string): string | undefined => {
  const location = res.headers.get("Location");
  if (!location) {
    return undefined;
  }
  try {
    const { origin } = new URL(location, url);
    // An opaque origin, such as a data: URL, has no host to name.
    return origin === "null" ? undefined : origin;
  } catch {
    return undefined;
  }
};

/**
 * Never log headers or bodies. They hold tokens and passwords.
 *
 * A redirect isn't followed unless the caller asks with `redirect: "follow"`:
 * fetch re-sends the body and custom headers, such as X-Auth-Token, to the new
 * host on a 307. A request with no `signal` gives up after REQUEST_TIMEOUT_MS.
 */
export const request = async (
  url: string,
  init: RequestInit = {}
): Promise<Response> => {
  const method = init.method ?? "GET";
  const redirect = init.redirect ?? "manual";
  const started = performance.now();
  debug(`${method} ${url}`);
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      redirect,
      signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new NetworkError(
      url,
      error instanceof Error ? describe(error) : String(error)
    );
  }
  debug(
    `${res.status} ${method} ${url} [${formatElapsed(performance.now() - started)}]`
  );
  if (redirect === "manual" && res.status >= 300 && res.status < 400) {
    const target = redirectTarget(res, url);
    throw new NetworkError(
      url,
      target ? `it redirects to ${target}` : "it redirects somewhere else"
    );
  }
  return res;
};

/**
 * The body of a response as text. The request's signal still runs while the
 * body streams, so a stall or a dropped connection here is a NetworkError, not
 * a raw TimeoutError with a stack.
 */
export const readText = async (res: Response): Promise<string> => {
  try {
    return await res.text();
  } catch (error) {
    throw new NetworkError(
      res.url,
      error instanceof Error ? describe(error) : String(error)
    );
  }
};

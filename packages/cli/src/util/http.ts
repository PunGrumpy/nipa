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

// Never log headers or bodies. They hold tokens and passwords.
export const request = async (
  url: string,
  init: RequestInit = {}
): Promise<Response> => {
  const method = init.method ?? "GET";
  const started = performance.now();
  debug(`${method} ${url}`);
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (error) {
    throw new NetworkError(
      url,
      error instanceof Error ? describe(error) : String(error)
    );
  }
  debug(
    `${res.status} ${method} ${url} [${formatElapsed(performance.now() - started)}]`
  );
  return res;
};

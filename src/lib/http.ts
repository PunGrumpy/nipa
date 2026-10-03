// fetch with `--debug` logging. The log has the method, URL, status and time,
// never headers or bodies, because those hold tokens and passwords.

import pc from "picocolors";

import { formatElapsed } from "./ui";

/** On with `--debug`, or with NIPA_DEBUG=1 in the environment. */
export const isDebug = (): boolean => process.env.NIPA_DEBUG === "1";

export const debug = (message: string): void => {
  if (isDebug()) {
    console.error(pc.dim(`> [debug] [${new Date().toISOString()}] ${message}`));
  }
};

/** The request never got an HTTP response: DNS, TLS, a refused connection or a timeout. */
export class NetworkError extends Error {
  readonly url: string;

  constructor(url: string, cause: string) {
    super(`can't reach ${new URL(url).host}: ${cause}`);
    this.name = "NetworkError";
    this.url = url;
  }
}

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
      error instanceof Error ? error.message : String(error)
    );
  }
  debug(
    `${res.status} ${method} ${url} [${formatElapsed(performance.now() - started)}]`
  );
  return res;
};

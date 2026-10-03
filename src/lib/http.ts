// fetch that turns a missing response into a NetworkError with the host name.

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
  try {
    return await fetch(url, init);
  } catch (error) {
    throw new NetworkError(
      url,
      error instanceof Error ? error.message : String(error)
    );
  }
};

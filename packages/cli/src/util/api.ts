import { z } from "zod";

import { request } from "./http";
import { CliError } from "./ui";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// The Space API answers a failure with {"status": 401, "message": "…"}.
const FaultSchema = z.object({ message: z.string() });

const readFault = async (res: Response): Promise<string | undefined> => {
  try {
    const parsed = FaultSchema.safeParse(JSON.parse(await res.text()));
    return parsed.success ? parsed.data.message : undefined;
  } catch {
    return undefined;
  }
};

const parseBody = async <T>(
  res: Response,
  schema: z.ZodType<T>
): Promise<z.ZodSafeParseResult<T>> => {
  try {
    return schema.safeParse(await res.json());
  } catch {
    return schema.safeParse(null);
  }
};

const trimSlashes = (text: string): string => {
  let trimmed = text;
  while (trimmed.endsWith("/")) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
};

/**
 * The Space API under a portal: https://space.nipa.cloud becomes
 * https://space.nipa.cloud/api, and an API URL stays as it is.
 */
export const spaceApiUrl = (url: string): string => {
  const { origin, pathname } = new URL(url);
  const path = trimSlashes(pathname);
  return path === "" ? `${origin}/api` : `${origin}${path}`;
};

/** Throws unless `url` answers a request without a token like the Space API. */
export const probeSpace = async (url: string): Promise<void> => {
  const res = await request(`${url}/v3/instances`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  const fault = await readFault(res);
  if (res.status !== 401 || fault === undefined) {
    throw new ApiError(
      `${url} doesn't answer like the Space API (HTTP ${res.status})`,
      res.status
    );
  }
};

const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/iu;

/**
 * Neutron sends UTC times without a zone, such as 2023-09-05T03:24:53.342305,
 * which Date.parse would read as local time. This adds the Z.
 */
export const utcTime = (time: string): string =>
  HAS_ZONE.test(time) ? time : `${time}Z`;

export interface Space {
  get: <T>(path: string, schema: z.ZodType<T>) => Promise<T>;
  post: (path: string) => Promise<void>;
}

/**
 * Nipa Cloud's Space API at `url`, the one the portal calls, as the project
 * in the token. It takes a Keystone token and serves every service on 443.
 */
export const createSpace = (input: {
  url: string;
  token: string;
  projectId: string;
  region: string;
}): Space => {
  const base = trimSlashes(input.url);
  const send = async (path: string, method: string): Promise<Response> => {
    const res = await request(`${base}${path}`, {
      headers: {
        Accept: "application/json",
        "Project-Id": input.projectId,
        Region: input.region,
        "X-Auth-Token": input.token,
      },
      method,
    });
    if (!res.ok) {
      const message =
        (await readFault(res)) ?? `the Space API returned HTTP ${res.status}`;
      throw new ApiError(message, res.status);
    }
    return res;
  };
  return {
    get: async (path, schema) => {
      const res = await send(path, "GET");
      // A portal answers a path it doesn't know with its web page.
      if (!res.headers.get("Content-Type")?.includes("json")) {
        throw new CliError(`${base} doesn't answer like the Space API`, {
          hint: "Check the profile's `spaceUrl` with `nipa profile ls --json`. It's the portal URL with /api, such as https://space.nipa.cloud/api.",
        });
      }
      const parsed = await parseBody(res, schema);
      if (!parsed.success) {
        throw new ApiError(
          `unexpected Space API response: ${z.prettifyError(parsed.error)}`,
          res.status
        );
      }
      return parsed.data;
    },
    post: async (path) => {
      await send(path, "POST");
    },
  };
};

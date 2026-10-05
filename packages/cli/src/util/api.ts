import { z } from "zod";

import { request } from "./http";

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

export interface Space {
  get: <T>(path: string, schema: z.ZodType<T>) => Promise<T>;
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
  let base = input.url;
  while (base.endsWith("/")) {
    base = base.slice(0, -1);
  }
  return {
    get: async (path, schema) => {
      const res = await request(`${base}${path}`, {
        headers: {
          Accept: "application/json",
          "Project-Id": input.projectId,
          Region: input.region,
          "X-Auth-Token": input.token,
        },
      });
      if (!res.ok) {
        const message =
          (await readFault(res)) ?? `the Space API returned HTTP ${res.status}`;
        throw new ApiError(message, res.status);
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
  };
};

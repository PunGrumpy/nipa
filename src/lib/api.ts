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

const MessageSchema = z.object({ message: z.string() });

// Nova and Cinder wrap the message in an object named after the fault, such
// as {"itemNotFound": {...}}, and Neutron in {"NeutronError": {...}}.
const FaultSchema = z.union([
  MessageSchema.transform((fault) => fault.message),
  z
    .record(z.string(), MessageSchema)
    .transform((faults) => Object.values(faults)[0]?.message),
]);

const readFault = async (res: Response): Promise<string | undefined> => {
  try {
    const parsed = FaultSchema.safeParse(JSON.parse(await res.text()));
    return parsed.success ? parsed.data : undefined;
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

export interface Service {
  get: <T>(
    path: string,
    schema: z.ZodType<T>,
    headers?: Record<string, string>
  ) => Promise<T>;
}

/** An OpenStack service at `url`, such as Nova, called with the token. */
export const createService = (input: {
  type: string;
  url: string;
  token: string;
}): Service => {
  let base = input.url;
  while (base.endsWith("/")) {
    base = base.slice(0, -1);
  }
  return {
    get: async (path, schema, headers = {}) => {
      const res = await request(`${base}${path}`, {
        headers: {
          Accept: "application/json",
          ...headers,
          "X-Auth-Token": input.token,
        },
      });
      if (!res.ok) {
        const message =
          (await readFault(res)) ?? `${input.type} returned HTTP ${res.status}`;
        throw new ApiError(message, res.status);
      }
      const parsed = await parseBody(res, schema);
      if (!parsed.success) {
        throw new ApiError(
          `unexpected ${input.type} response: ${z.prettifyError(parsed.error)}`,
          res.status
        );
      }
      return parsed.data;
    },
  };
};

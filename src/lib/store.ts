// Config and session files under ~/.config/nipa (or $NIPA_CONFIG_DIR). nipa
// writes both 0600 inside a 0700 directory because the session holds a bearer token.

import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { z } from "zod";

import { ProjectSchema } from "./keystone";

export const DEFAULT_CONFIG = {
  authUrl: "https://identity-api.nipa.cloud/v3",
  region: "NCP-TH",
  userDomain: "nipacloud",
} as const;

const ConfigSchema = z.object({
  authUrl: z.url().default(DEFAULT_CONFIG.authUrl),
  project: ProjectSchema.optional(),
  region: z.string().default(DEFAULT_CONFIG.region),
  userDomain: z.string().default(DEFAULT_CONFIG.userDomain),
  username: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

const SessionSchema = z.object({
  expiresAt: z.iso.datetime({ offset: true }),
  project: ProjectSchema,
  token: z.string().min(1),
  user: z.object({ id: z.string(), name: z.string() }),
});

export type Session = z.infer<typeof SessionSchema>;

export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreError";
  }
}

/** Tokens this close to expiry count as expired, so a command does not fail halfway. */
export const EXPIRY_MARGIN_MS = 60_000;

export const configDir = (env: NodeJS.ProcessEnv = process.env): string =>
  env.NIPA_CONFIG_DIR ??
  path.join(env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"), "nipa");

const configPath = () => path.join(configDir(), "config.json");
const sessionPath = () => path.join(configDir(), "auth.json");

const readText = async (file: string): Promise<string | undefined> => {
  try {
    return await readFile(file, "utf-8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
};

const readJson = async <T>(
  file: string,
  schema: z.ZodType<T>
): Promise<T | undefined> => {
  const text = await readText(file);
  if (text === undefined) {
    return undefined;
  }
  let json: z.core.util.JSONType;
  try {
    json = JSON.parse(text);
  } catch {
    throw new StoreError(`${file} is not valid JSON`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new StoreError(`${file}: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
};

const writeJson = async (
  file: string,
  value: Config | Session
): Promise<void> => {
  await mkdir(configDir(), { mode: 0o700, recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  // mode only applies when the file is created
  await chmod(file, 0o600);
};

export const loadConfig = async (): Promise<Config> =>
  (await readJson(configPath(), ConfigSchema)) ?? ConfigSchema.parse({});

export const saveConfig = (config: Config): Promise<void> =>
  writeJson(configPath(), config);

export const loadSession = (): Promise<Session | undefined> =>
  readJson(sessionPath(), SessionSchema);

export const saveSession = (session: Session): Promise<void> =>
  writeJson(sessionPath(), session);

export const clearSession = (): Promise<void> =>
  rm(sessionPath(), { force: true });

export const msUntilExpiry = (session: Session, now = Date.now()): number =>
  Date.parse(session.expiresAt) - now;

export const isActive = (
  session: Session | undefined,
  now = Date.now()
): session is Session =>
  session !== undefined && msUntilExpiry(session, now) > EXPIRY_MARGIN_MS;

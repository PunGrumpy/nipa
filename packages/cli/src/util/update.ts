import { z } from "zod";

import { debug, request } from "./http";
import { readCache, writeCache } from "./store";
import { cyan, dim, green, writeStderr } from "./ui";

const RELEASES = "https://github.com/PunGrumpy/nipa/releases";
const LATEST_API =
  "https://api.github.com/repos/PunGrumpy/nipa/releases/latest";
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

const CacheSchema = z.object({
  checkedAt: z.iso.datetime(),
  latest: z.string(),
});

type Cache = z.infer<typeof CacheSchema>;

const CACHE_FILE = "update.json";

const ReleaseSchema = z.object({ tag_name: z.string() });

const parts = (version: string): number[] =>
  version.replace(/^v/u, "").split("-")[0]?.split(".").map(Number) ?? [];

export const isNewer = (latest: string, current: string): boolean => {
  const a = parts(latest);
  const b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) {
      return diff > 0;
    }
  }
  return false;
};

/**
 * `interactive` is the run's prompt mode: a terminal, and no `--json`,
 * `--non-interactive` or CI. Output for a program or a log gets no notice,
 * and no request to GitHub either.
 */
export const shouldCheck = (input: {
  version: string;
  env: NodeJS.ProcessEnv;
  interactive: boolean;
}): boolean =>
  input.interactive &&
  input.version !== "0.0.0" &&
  !input.env.NIPA_NO_UPDATE_CHECK &&
  !input.env.NO_UPDATE_NOTIFIER;

const fetchLatest = async (): Promise<string | undefined> => {
  try {
    // GitHub may redirect the API URL, and this call carries no secret.
    const res = await request(LATEST_API, {
      redirect: "follow",
      signal: AbortSignal.timeout(1500),
    });
    const parsed = ReleaseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.tag_name.replace(/^v/u, "") : undefined;
  } catch (error) {
    debug(
      `update check failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
};

export const releaseNotes = (version: string): string =>
  `${RELEASES}/tag/v${version}`;

/** The newer version the last check found, from the cache only. */
export const knownUpdate = async (
  version: string
): Promise<string | undefined> => {
  const cache = await readCache(CACHE_FILE, CacheSchema);
  return cache && isNewer(cache.latest, version) ? cache.latest : undefined;
};

export const updateNotice = (latest: string, current: string): string =>
  [
    "",
    `nipa ${green(latest)} is available. You have ${dim(current)}.`,
    `Release notes: ${cyan(releaseNotes(latest))}`,
  ].join("\n");

interface CheckOptions {
  /** Whether this run may talk to a person. See `shouldCheck`. */
  interactive: boolean;
  env?: NodeJS.ProcessEnv;
  /** Replaces the GitHub request in tests. */
  latest?: () => Promise<string | undefined>;
}

const check = async (version: string, options: CheckOptions): Promise<void> => {
  const env = options.env ?? process.env;
  if (!shouldCheck({ env, interactive: options.interactive, version })) {
    return;
  }
  const cache = await readCache(CACHE_FILE, CacheSchema);
  if (cache && isNewer(cache.latest, version)) {
    writeStderr(updateNotice(cache.latest, version));
  }
  if (cache && Date.now() - Date.parse(cache.checkedAt) < CHECK_EVERY_MS) {
    return;
  }
  const latest = await (options.latest ?? fetchLatest)();
  // A failed check is remembered too, so a blocked GitHub costs one
  // timeout a day, not one per command. The last answer stays.
  const next: Cache = {
    checkedAt: new Date().toISOString(),
    latest: latest ?? cache?.latest ?? version,
  };
  await writeCache(CACHE_FILE, next);
};

/**
 * Prints the answer from the last check and refreshes it for the next run,
 * so no command waits on GitHub. It never fails the command: a cache nipa
 * can't write is reported with --debug and tried again next time.
 */
export const checkForUpdate = async (
  version: string,
  options: CheckOptions
): Promise<void> => {
  try {
    await check(version, options);
  } catch (error) {
    debug(
      `update check failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

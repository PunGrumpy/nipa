import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

const FILE = path.join(process.cwd(), "../../packages/cli/CHANGELOG.md");
const RELEASES_API =
  "https://api.github.com/repos/PunGrumpy/nipa/releases?per_page=100";

export interface Segment {
  at: number;
  code: boolean;
  text: string;
}

export interface Change {
  commit?: string;
  segments: Segment[];
  text: string;
}

export interface Release {
  changes: Change[];

  date?: string;
  version: string;
}

const VERSION = /^## (?<version>\S+)/u;
const CHANGE = /^- (?:(?<commit>[0-9a-f]{7,40}): )?(?<text>.+)$/u;

const toSegments = (text: string): Segment[] => {
  const segments: Segment[] = [];
  let at = 0;
  for (const [index, part] of text.split("`").entries()) {
    if (part !== "") {
      segments.push({ at, code: index % 2 === 1, text: part });
    }
    at += part.length + 1;
  }
  return segments;
};

export const parseChangelog = (markdown: string): Release[] => {
  const releases: Release[] = [];
  for (const line of markdown.split("\n")) {
    const version = VERSION.exec(line)?.groups?.version;
    if (version) {
      releases.push({ changes: [], version });
      continue;
    }
    const change = CHANGE.exec(line)?.groups;
    if (change?.text) {
      releases.at(-1)?.changes.push({
        commit: change.commit,
        segments: toSegments(change.text),
        text: change.text,
      });
    }
  }
  return releases;
};

const ReleasesSchema = z.array(
  z.object({ published_at: z.string(), tag_name: z.string() })
);

const releaseDates = async (): Promise<Map<string, string>> => {
  try {
    const token = process.env.GITHUB_TOKEN;
    const response = await fetch(RELEASES_API, {
      cache: "force-cache",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) {
      return new Map();
    }
    const parsed = ReleasesSchema.safeParse(await response.json());
    return new Map(
      (parsed.success ? parsed.data : []).map((release) => [
        release.tag_name.replace(/^v/u, ""),
        release.published_at,
      ])
    );
  } catch {
    return new Map();
  }
};

export const loadChangelog = async (): Promise<Release[]> => {
  const [markdown, dates] = await Promise.all([
    readFile(FILE, "utf-8"),
    releaseDates(),
  ]);
  return parseChangelog(markdown).map((release) => ({
    ...release,
    date: dates.get(release.version),
  }));
};

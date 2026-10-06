// A folder's link to a profile and project, like the Vercel CLI's
// .vercel/project.json. `nipa link` writes .nipa/project.json, and every
// command in that folder, or a folder below it, uses its project.

import { mkdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { ProjectSchema } from "./keystone";
import { CliError } from "./ui";

const LINK_DIR = ".nipa";
const LINK_FILE = "project.json";

const LinkSchema = z.object({ profile: z.string(), project: ProjectSchema });

export type Link = z.infer<typeof LinkSchema>;

export interface FoundLink {
  /** The link file's path. */
  readonly file: string;
  readonly link: Link;
}

const linkFile = (dir: string): string => path.join(dir, LINK_DIR, LINK_FILE);

const unreadable = (file: string, problem: string): CliError =>
  new CliError(`${file} ${problem}`, {
    hint: "Fix the file, or run `nipa unlink` and `nipa link` again.",
  });

const readLink = async (file: string): Promise<Link | undefined> => {
  let text: string;
  try {
    text = await readFile(file, "utf-8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw unreadable(file, "isn't valid JSON");
  }
  const parsed = LinkSchema.safeParse(json);
  if (!parsed.success) {
    throw unreadable(
      file,
      `isn't a nipa link: ${z.prettifyError(parsed.error)}`
    );
  }
  return parsed.data;
};

/** The closest link at or above `dir`, or undefined in a folder without one. */
export const findLink = async (
  dir = process.cwd()
): Promise<FoundLink | undefined> => {
  const file = linkFile(dir);
  const link = await readLink(file);
  if (link) {
    return { file, link };
  }
  const parent = path.dirname(dir);
  return parent === dir ? undefined : findLink(parent);
};

/** Links `dir` and returns the file it wrote. */
export const saveLink = async (input: {
  dir: string;
  link: Link;
}): Promise<string> => {
  const file = linkFile(input.dir);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(input.link, null, 2)}\n`);
  return file;
};

/** Deletes the link file, and its folder when nothing else is in it. */
export const removeLink = async (file: string): Promise<void> => {
  await rm(file, { force: true });
  try {
    await rmdir(path.dirname(file));
  } catch {
    // The folder has other files, so it stays.
  }
};

/** The link file's path as the person would type it from `cwd`. */
export const displayPath = (file: string, cwd = process.cwd()): string =>
  path.relative(cwd, file);

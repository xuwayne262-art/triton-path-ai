import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CourseDetail, PlatIndex, ProfessorFile } from "./plat";

/**
 * The dataset, read from disk on the server, for the titles and descriptions
 * a link preview shows. The pages themselves read the same files in the
 * browser; this only names them, so a course shared in a group chat arrives
 * as "CSE 12 — Basic Data Structures…" rather than as the site's name.
 *
 * Every read is best-effort: metadata that cannot be read falls back to the
 * code alone, never to an error page.
 */

const DATA = path.join(process.cwd(), "public", "data", "plat");

async function readJson<T>(...parts: string[]): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(DATA, ...parts), "utf8")) as T;
  } catch {
    return null;
  }
}

/** A subject code as it may appear in a file name: letters only, so a path cannot climb out. */
export const safeSubject = (s: string) => (/^[A-Z]{2,5}$/.test(s) ? s : null);

export async function courseForMeta(sub: string, code: string): Promise<{ detail: CourseDetail | null; termName: string | null }> {
  const s = safeSubject(sub);
  if (!s) return { detail: null, termName: null };
  const file = await readJson<{ termName?: string; courses?: Record<string, CourseDetail> }>("subject", `${s}.json`);
  return { detail: file?.courses?.[code] ?? null, termName: file?.termName ?? null };
}

let profs: Promise<ProfessorFile | null> | null = null;
export function professorsForMeta(): Promise<ProfessorFile | null> {
  profs ??= readJson<ProfessorFile>("professors.json");
  return profs;
}

let index: Promise<PlatIndex | null> | null = null;
export function indexForMeta(): Promise<PlatIndex | null> {
  index ??= readJson<PlatIndex>("index.json");
  return index;
}

/** Where the site lives, for absolute links in the sitemap. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://ucsdplans.com").replace(/\/+$/, "");

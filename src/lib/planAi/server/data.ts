import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tidyTitle, type CourseRow, type GEFile, type PlatIndex, type SubjectFile } from "@/lib/plat";

/**
 * The dataset as the server reads it, for checking a change before it is
 * saved: the same files the browser loads from /data/plat, read from disk
 * (next.config.ts traces them into the functions that need them). Each is
 * read once per server instance; a data update is a new deployment, so a
 * running instance never holds two versions.
 */

const ROOT = () => join(process.cwd(), "public", "data", "plat");

let index: Promise<{ file: PlatIndex; rows: Map<string, CourseRow> }> | null = null;
let ge: Promise<GEFile> | null = null;
const subjects = new Map<string, Promise<SubjectFile | null>>();

export function serverIndex(): Promise<{ file: PlatIndex; rows: Map<string, CourseRow> }> {
  index ??= readFile(join(ROOT(), "index.json"), "utf8").then((text) => {
    const file = JSON.parse(text) as PlatIndex;
    for (const c of file.courses) c.t = tidyTitle(c.t);
    return { file, rows: new Map(file.courses.map((c) => [c.k, c])) };
  });
  index.catch(() => { index = null; });
  return index;
}

export function serverGE(): Promise<GEFile> {
  ge ??= readFile(join(ROOT(), "ge.json"), "utf8").then((text) => JSON.parse(text) as GEFile);
  ge.catch(() => { ge = null; });
  return ge;
}

/** A subject's file, or null when this term has none. The code is checked before it names a path. */
export function serverSubject(subject: string): Promise<SubjectFile | null> {
  if (!/^[A-Z]{2,5}$/.test(subject)) return Promise.resolve(null);
  let hit = subjects.get(subject);
  if (!hit) {
    hit = readFile(join(ROOT(), "subject", `${subject}.json`), "utf8")
      .then((text) => JSON.parse(text) as SubjectFile)
      .catch((err: NodeJS.ErrnoException) => {
        if (err?.code === "ENOENT") return null;
        subjects.delete(subject);
        throw err;
      });
    subjects.set(subject, hit);
  }
  return hit;
}

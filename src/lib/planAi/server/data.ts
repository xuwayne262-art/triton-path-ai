import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tidyTitle, type CourseRow, type GEFile, type PlatIndex, type SubjectFile } from "@/lib/plat";
import { overlayIndex, overlaySubject, type TermIndexFile, type TermSubjectFile } from "@/lib/termData";
import { termEntry } from "@/lib/terms";

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

// ── One quarter's schedule ───────────────────────────────────────────────────

const termIndexes = new Map<string, Promise<{ file: PlatIndex; rows: Map<string, CourseRow> }>>();
const termSubjects = new Map<string, Promise<SubjectFile | null>>();

/**
 * One quarter's course index, laid over the shared one as the browser lays it
 * (lib/termData.ts); null when the site has no schedule for that quarter.
 */
export function serverIndexFor(term: string): Promise<{ file: PlatIndex; rows: Map<string, CourseRow> } | null> {
  const entry = termEntry(term);
  if (!entry) return Promise.resolve(null);
  if (entry.path === null) return serverIndex();
  let hit = termIndexes.get(term);
  if (!hit) {
    const path = entry.path;
    hit = Promise.all([serverIndex(), readFile(join(ROOT(), path, "index.json"), "utf8")]).then(([base, text]) => {
      const own = JSON.parse(text) as TermIndexFile;
      if (own.meta.term !== term) throw new Error(`${path}/index.json is for ${own.meta.term}, not ${term}`);
      const file = overlayIndex(base.file, own, entry);
      for (const c of file.courses) c.t = tidyTitle(c.t);
      return { file, rows: new Map(file.courses.map((c) => [c.k, c])) };
    });
    const request = hit;
    request.catch(() => { if (termIndexes.get(term) === request) termIndexes.delete(term); });
    termIndexes.set(term, hit);
  }
  return hit;
}

/** One subject in one quarter, or null when neither the shared nor the quarter's files have it. */
export function serverSubjectFor(subject: string, term: string): Promise<SubjectFile | null> {
  const entry = termEntry(term);
  if (!entry || !/^[A-Z]{2,5}$/.test(subject)) return Promise.resolve(null);
  if (entry.path === null) return serverSubject(subject);
  const key = `${term}|${subject}`;
  let hit = termSubjects.get(key);
  if (!hit) {
    const path = entry.path;
    hit = Promise.all([
      serverSubject(subject),
      readFile(join(ROOT(), path, "subject", `${subject}.json`), "utf8")
        .then((text) => JSON.parse(text) as TermSubjectFile)
        .catch((err: NodeJS.ErrnoException) => {
          if (err?.code === "ENOENT") return null;
          throw err;
        }),
    ]).then(([base, own]) => {
      if (!base && !own) return null;
      if (own && own.term !== term) throw new Error(`${path}/subject/${subject}.json is for ${own.term}, not ${term}`);
      return overlaySubject(base, own, subject, entry);
    });
    const request = hit;
    request.catch(() => { if (termSubjects.get(key) === request) termSubjects.delete(key); });
    termSubjects.set(key, hit);
  }
  return hit;
}

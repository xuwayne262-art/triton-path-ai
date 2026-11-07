/**
 * One quarter's schedule, laid over the shared course dataset.
 *
 * The shared files (index.json, subject/*.json) hold what does not change by
 * quarter — the catalog, grade history, GE lists, ratings — and Fall 2026's
 * sections, which is how the site worked before it served two quarters. A
 * later quarter's files (terms/WI27/...) hold only that quarter's listings.
 * The loaders here put the two together into the shapes every page already
 * reads (PlatIndex, SubjectFile), so a page shows Winter by asking for
 * Winter, and nothing of Fall's schedule — sections, seats, rooms, "teaching
 * this term" — leaks into it.
 */

import {
  HttpError, loadIndex, loadJSON, loadProfessors, loadSubject, tidyTitle,
  type CourseDetail, type CourseRow, type PlatIndex, type ProfRecord, type ProfessorFile,
  type SectionTuple, type SubjectFile,
} from "@/lib/plat";
import { BASE_TERM, termEntry, type TermEntry, type TermFeatures } from "@/lib/terms";
import { parseUnits, unitsText } from "@/lib/units";

// ── What a term's files hold ─────────────────────────────────────────────────

/** One published meeting, exactly as UCSD's public schedule gives it. */
export interface TermMeeting {
  meeting_kind: string;
  day_code: string | null;
  day_name: string | null;
  specific_date: string | null;
  start_minutes: number | null;
  end_minutes: number | null;
  start_time_display: string | null;
  end_time_display: string | null;
  is_remote: boolean;
  is_tba: boolean;
}

/** One section, as published. `section_ref` ("WI27:E 00007935") is its identity across refreshes. */
export interface TermSection {
  section_id: string;
  section_ref: string;
  /** "001-000-LE", as UCSD writes it; "A00" is only how the site shows it. */
  section_code: string;
  instruction_type_name: string;
  event_package_ids: string[];
  capacity: number | null;
  enrolled: number | null;
  seats_available: number | null;
  waitlist_capacity: number | null;
  waitlist_enrolled: number | null;
  waitlist_available: number | null;
  /** "AC", "waitlist_only", ... */
  status: string;
  instructors: string[];
  meetings: TermMeeting[];
  /** UCSD's notes on the section. Untrusted text: shown as text, never as markup or links. */
  section_text: string[];
  course_fees: string[];
}

/**
 * One listing of a course. A course can have several — topics (CSE 190's six)
 * or section families (COGS 160's two) — each with its own name, instructors,
 * restrictions and units, and the site keeps them apart.
 */
export interface TermListing {
  course_code: string;
  module_code: string;
  /** What UCSD's schedule calls this listing; a topics course's topic. */
  module_name: string;
  /** Present only on some listings; never assumed to equal the catalog title. */
  course_title: string | null;
  academic_level: string;
  section_count: number;
  matching_section_count: number;
  complete_package_count: number;
  open_package_count: number;
  waitlist_package_count: number;
  open_section_count: number;
  /** UCSD's course-level figure. Not used for totals: it disagrees with its own sections on many listings. */
  open_seat_count: number;
  waitlist_available_count: number;
  instruction_types: string[];
  instructors: string[];
  is_topic_course: boolean;
  section_family: string | null;
  /** Exactly as printed: "4 units", "0 units", "2.5 units". */
  units_display: string;
  course_fees: string[];
  prerequisites: string[];
  restrictions: string[];
  sections: TermSection[];
}

/** A department's own notes for a term, apart from UCSD's schedule (and sometimes at odds with it). */
export interface DeptGuidance {
  name: string;
  url: string;
  authority: string;
  rows?: Record<string, string>[];
  notes?: string[];
}

export interface TermCourse {
  t: string;
  topics?: string[];
  u: string;
  lvl: string | null;
  fa: string[];
  res: string | null;
  /** The listing's prerequisites as this term's schedule words them. */
  tpre: string | null;
  listings: TermListing[];
  dept?: DeptGuidance;
  cat?: { url: string; heading?: string; text?: string };
}

export interface TermSubjectFile {
  code: string;
  name: string;
  term: string;
  termName: string;
  v: string;
  courses: Record<string, TermCourse>;
}

export interface TermRow {
  k: string; s: string; c: string; t: string; u: string;
  sa: number | null; sl: number | null;
  /** Every counted section takes a waitlist only. */
  wo?: 1;
  d: string | null; st: string | null; en: string | null;
  p: string | null;
  in?: string[];
  pq: number | null; pn: number | null; pa: number | null; pd: number | null; pg: number | null;
  lvl: string | null;
  /** The schedule lists prerequisites for it. */
  tp?: 1;
  /** No section has a weekly time. */
  tba?: 1;
  /** The shared dataset has never seen this course. */
  nb?: 1;
  ct?: 0;
}

export interface TermIndexFile {
  meta: {
    term: string;
    termName: string;
    v: string;
    source: string;
    refreshed: string | null;
    counts: Record<string, number>;
    summary: { courses: number | null; sections: number | null; meetings: number | null };
    features: TermFeatures;
    subjects: { code: string; name: string; offered: number }[];
  };
  courses: TermRow[];
}

// ── Listings -> the site's section tuples ────────────────────────────────────

const TYPE: Record<string, string> = {
  lecture: "LE", discussion: "DI", lab: "LA", se: "SE", st: "ST", pr: "PR",
  in: "IN", cl: "CL", tu: "TU", fw: "FW", it: "IT", co: "CO", ot: "OT",
};
export const typeCode = (name: string) => TYPE[name] || String(name || "").slice(0, 2).toUpperCase() || "OT";

const DAY: Record<string, string> = { M: "M", T: "Tu", W: "W", R: "Th", F: "F", S: "Sa", U: "Su" };
const DAY_ORDER = ["M", "T", "W", "R", "F", "S", "U"];
const clock = (s: string | null) => String(s || "").replace(/([ap])m$/i, "$1");

/** No real time: TBA, or UCSD's 12:00am-to-12:00am placeholder. */
export const untimed = (m: TermMeeting) =>
  m.start_minutes == null || m.end_minutes == null || m.start_minutes === m.end_minutes || /^tba$/i.test(String(m.start_time_display ?? "").trim());

/** "001-000-LE" -> "A00", "002-003-DI" -> "B03": the family letter WebReg printed, for display only. */
export function displayCode(sectionCode: string): string {
  const m = /^(\d+)-(\d+)-/.exec(String(sectionCode || ""));
  if (!m) return String(sectionCode || "");
  const family = Number(m[1]);
  if (!family || family > 26) return String(sectionCode);
  return String.fromCharCode(64 + family) + String(Number(m[2])).padStart(2, "0");
}

interface Folded {
  kind: string;
  days: string[];
  dayText: string;
  start: string;
  end: string;
  startMin: number | null;
  endMin: number | null;
  date: string | null;
  remote: boolean;
  tba: boolean;
}

/** UCSD sends one row per weekday; a MWF lecture is folded back into one "MWF" meeting. */
export function foldMeetings(meetings: TermMeeting[]): Folded[] {
  const groups = new Map<string, Folded>();
  for (const m of meetings) {
    const key = [m.meeting_kind, m.start_time_display, m.end_time_display, m.specific_date, m.is_remote, m.is_tba].join("|");
    let g = groups.get(key);
    if (!g) {
      const none = untimed(m);
      g = {
        kind: m.meeting_kind,
        days: [],
        dayText: "",
        start: none ? "" : clock(m.start_time_display),
        end: none ? "" : clock(m.end_time_display),
        startMin: none ? null : m.start_minutes,
        endMin: none ? null : m.end_minutes,
        date: m.specific_date || null,
        remote: !!m.is_remote,
        tba: !!m.is_tba,
      };
      groups.set(key, g);
    }
    if (m.day_code && !g.days.includes(m.day_code)) g.days.push(m.day_code);
  }
  for (const g of groups.values()) {
    g.days.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
    g.dayText = g.days.map((d) => DAY[d] || d).join("");
  }
  return [...groups.values()];
}

const weekly = (m: Folded) => m.kind === "class" && !m.date;
const onceType = (m: Folded) => (m.kind === "final" ? "FI" : m.kind === "midterm" ? "MI" : "OT");
const cancelled = (status: string) => /cancel/i.test(status || "");

/**
 * A term's listings as the positional tuples the course page, the planner
 * and the calendar export read (see SectionTuple). No building or room: UCSD's
 * public schedule does not publish them, and a remote meeting says "Remote".
 */
export function listingTuples(listings: TermListing[], topical: boolean): SectionTuple[] {
  const out: SectionTuple[] = [];
  for (const l of listings) {
    const topic = topical ? l.module_name : "";
    for (const s of l.sections) {
      const folded = foldMeetings(s.meetings || []);
      const cls = folded.filter(weekly);
      const once = folded.filter((m) => !weekly(m));
      const display = displayCode(s.section_code);
      for (const m of cls.length ? cls : [null]) {
        out.push([
          display, typeCode(s.instruction_type_name), m ? m.dayText : "", m ? m.start : "", m ? m.end : "",
          m?.remote ? "Remote" : "", "", (s.instructors || []).join(", "),
          s.seats_available ?? null, s.capacity ?? null, cancelled(s.status) ? 1 : 0,
          s.waitlist_enrolled ?? 0, s.enrolled ?? null, s.section_id, s.event_package_ids || [],
          m ? m.startMin : null, m ? m.endMin : null, "", s.status || "", topic, "",
        ]);
      }
      for (const m of once) {
        out.push([
          m.date || display, onceType(m), m.date || "", m.start, m.end, m.remote ? "Remote" : "", "", "",
          null, null, 0, 0, null, s.section_id, s.event_package_ids || [], m.startMin, m.endMin, "", "", topic, "",
        ]);
      }
    }
  }
  return out;
}

/** The listing and section behind a tuple, by section id. */
export function sectionById(listings: TermListing[] | undefined, id: string): { listing: TermListing; section: TermSection } | null {
  for (const listing of listings ?? []) {
    const section = listing.sections.find((s) => s.section_id === id);
    if (section) return { listing, section };
  }
  return null;
}

// ── Laying a term over the shared dataset ────────────────────────────────────

/** Surname plus first initial: the most a schedule spelling and an archive name reliably share. */
export function sameInstructor(a: string, b: string): boolean {
  if (!a || !b) return false;
  const parts = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);
  const pa = parts(a);
  const pb = parts(b);
  if (!pa.length || !pb.length || pa[pa.length - 1] !== pb[pb.length - 1]) return false;
  return pa[0][0] === pb[0][0];
}

/**
 * A course's instructor records with "teaching this term" set for this term's
 * names, and a record with no history for anyone new to the course, so a page
 * names the right person instead of a past instructor.
 */
export function profsForTerm(profs: ProfRecord[], instructors: string[]): ProfRecord[] {
  const out = profs.map((p) => ({ ...p, cur: (instructors.some((n) => sameInstructor(p.i, n)) ? 1 : 0) as 0 | 1 }));
  for (const name of instructors) {
    if (out.some((p) => sameInstructor(p.i, name))) continue;
    out.push({ i: name, g: 0, A: 0, B: 0, C: 0, D: 0, F: 0, W: 0, P: 0, NP: 0, n: 0, y: null, cur: 1, rq: null, rd: null, rw: null, rn: null, rid: null });
  }
  return out.sort((a, b) => b.cur - a.cur || b.n - a.n || b.g - a.g);
}

const EMPTY_DETAIL: CourseDetail = {
  t: "", u: null, desc: null, pre: null, unl: [], hist: [], ge: [], gpa: null, aRate: null, terms: 0,
  offered: 0, seatUrl: null, tss: null, res: null, fa: [], profs: [], sec: [],
};

/** A shared course as one term sees it: offered with these listings, or not offered at all. */
export function courseForTerm(base: CourseDetail | null, t: TermCourse | null, term: string): CourseDetail {
  const shared = base ?? { ...EMPTY_DETAIL, t: t?.t ?? "" };
  if (!t) {
    return {
      ...shared, term, offered: 0, sec: [], fa: [], res: null, tss: null, seatUrl: null, seatsAt: undefined,
      profs: shared.profs.map((p) => ({ ...p, cur: 0 as const })),
    };
  }
  return {
    ...shared,
    term,
    t: shared.t || tidyTitle(t.t),
    // Units as this quarter's listing prints them, with the catalog's beside them when they differ.
    u: t.u || shared.u,
    ...(t.u && shared.u && unitsText(parseUnits(t.u)) !== unitsText(parseUnits(shared.u)) ? { ucat: shared.u } : {}),
    desc: shared.desc ?? t.cat?.text ?? null,
    pre: shared.pre ?? t.tpre ?? null,
    offered: 1,
    // No exact booking link: the public schedule gives no TSS module.
    seatUrl: null,
    tss: null,
    res: t.res,
    fa: t.fa,
    seatsAt: undefined,
    profs: profsForTerm(shared.profs, t.fa),
    sec: listingTuples(t.listings, (t.topics?.length ?? 0) > 1),
    listings: t.listings,
    ...(t.topics ? { topics: t.topics } : {}),
    lvl: t.lvl,
    tpre: t.tpre,
    ...(t.dept ? { dept: t.dept } : {}),
    ...(t.cat ? { cat: t.cat } : {}),
  };
}

export function overlaySubject(base: SubjectFile | null, file: TermSubjectFile | null, sub: string, entry: TermEntry): SubjectFile {
  const courses: Record<string, CourseDetail> = {};
  for (const [code, c] of Object.entries(base?.courses ?? {})) courses[code] = courseForTerm(c, file?.courses[code] ?? null, entry.code);
  for (const [code, t] of Object.entries(file?.courses ?? {})) {
    if (!courses[code]) courses[code] = courseForTerm(null, t, entry.code);
  }
  return {
    code: sub,
    name: base?.name ?? file?.name ?? sub,
    term: entry.code,
    termName: entry.name,
    courses,
    features: entry.features,
    v: file?.v ?? entry.v,
    ...(file && file.v !== entry.v ? { stale: true } : {}),
  };
}

const UNOFFERED = { o: 0 as const, sa: null, sl: null, d: null, st: null, en: null, b: null, p: null, pq: null, pn: null, pa: null, pd: null, pg: null };

export function overlayIndex(base: PlatIndex, file: TermIndexFile, entry: TermEntry): PlatIndex {
  const rows = new Map(file.courses.map((r) => [r.k, r]));
  const termFields = (t: TermRow) => ({
    o: 1 as const, sa: t.sa, sl: t.sl, d: t.d, st: t.st, en: t.en, b: null, p: t.p,
    pq: t.pq, pn: t.pn, pa: t.pa, pd: t.pd, pg: t.pg,
    ...(t.wo ? { wo: 1 as const } : {}),
    ...(t.in ? { in: t.in } : {}),
  });
  const courses: CourseRow[] = base.courses.map((row) => {
    // Fall's seat-count time describes Fall's seats only.
    const rest = { ...row };
    delete rest.sat;
    const t = rows.get(row.k);
    return t ? { ...rest, ...termFields(t), pr: (row.pr || (t.tp ? 1 : 0)) as 0 | 1 } : { ...rest, ...UNOFFERED };
  });
  for (const t of file.courses) {
    if (!t.nb) continue;
    courses.push({
      k: t.k, s: t.s, c: t.c, t: tidyTitle(t.t), u: t.u, g: null, a: null, r: 0, pr: t.tp ? 1 : 0,
      ...(t.ct === 0 ? { ct: 0 as const } : {}),
      ...termFields(t),
    });
  }
  const known = new Map(base.subjects.map((s) => [s.code, s]));
  for (const s of file.meta.subjects) if (!known.has(s.code)) known.set(s.code, { code: s.code, name: s.name, n: 0, offered: 0 });
  const subjects = [...known.values()].map((s) => ({
    ...s,
    n: courses.filter((c) => c.s === s.code).length,
    offered: courses.filter((c) => c.s === s.code && c.o).length,
  })).sort((a, b) => a.code.localeCompare(b.code));
  // Fall's seat times and read time say nothing about this term.
  const shared = { ...base.meta };
  delete shared.seatsAsOf;
  delete shared.seatsNewest;
  delete shared.retrieved;
  return {
    meta: {
      ...shared,
      term: entry.code,
      termName: entry.name,
      offered: courses.filter((c) => c.o).length,
      refreshed: file.meta.refreshed,
      counts: file.meta.summary,
      sources: [
        ...shared.sources.filter((s) => !/Class Planner/.test(s)),
        `${file.meta.source}: ${file.meta.counts.courses} courses offered in ${entry.name}, refreshed ${file.meta.refreshed ?? "unknown"}`,
      ],
      features: entry.features,
      v: file.meta.v,
      ...(file.meta.v !== entry.v ? { stale: true } : {}),
    },
    subjects,
    courses,
  };
}

/** "Teaching this term" on the professor index, for one term's instructors. */
export function overlayProfessors(base: ProfessorFile, file: TermIndexFile): ProfessorFile {
  const teaching = new Map<string, string[]>();
  for (const r of file.courses) teaching.set(r.k, r.in ?? (r.p ? [r.p] : []));
  const matches = (names: string[], prof: { n: string; a?: string[] }) =>
    names.some((n) => n === prof.n || (prof.a ?? []).includes(n) || sameInstructor(prof.n, n));
  return {
    meta: { term: file.meta.term },
    professors: base.professors.map((p) => {
      const c = p.c.map((row) => {
        const now = matches(teaching.get(row[0]) ?? [], p) ? 1 : 0;
        return [row[0], row[1], row[2], now as 0 | 1, row[4]] as typeof row;
      });
      return { ...p, cur: (c.some((row) => row[3]) ? 1 : 0) as 0 | 1, c };
    }),
  };
}

// ── Loaders ──────────────────────────────────────────────────────────────────

/** Asked for a quarter the site has no schedule for. Pages say so; they never show another quarter instead. */
export class UnknownTermError extends Error {
  readonly term: string;
  constructor(term: string) {
    super(`No schedule for ${term}`);
    this.name = "UnknownTermError";
    this.term = term;
  }
}

const merged = new Map<string, Promise<unknown>>();

function memo<T>(key: string, make: () => Promise<T>): Promise<T> {
  let hit = merged.get(key) as Promise<T> | undefined;
  if (!hit) {
    hit = make();
    const request = hit;
    request.catch(() => {
      if (merged.get(key) === request) merged.delete(key);
    });
    merged.set(key, hit);
  }
  return hit;
}

function entryFor(term: string): TermEntry {
  const entry = termEntry(term);
  if (!entry) throw new UnknownTermError(term);
  return entry;
}

const termFile = <T,>(entry: TermEntry, rel: string) => loadJSON<T>(`/data/plat/${entry.path}/${rel}`);

/** A missing file is null; any other failure stays a failure. */
const orNull = <T,>(p: Promise<T>): Promise<T | null> =>
  p.catch((err) => {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  });

/** The course index for one quarter: Fall 2026 is the shared file, later quarters are laid over it. */
export function loadIndexFor(term: string): Promise<PlatIndex> {
  return memo(`index|${term}`, async () => {
    const entry = entryFor(term);
    if (entry.path === null) return loadIndex();
    const [base, file] = await Promise.all([loadIndex(), termFile<TermIndexFile>(entry, "index.json")]);
    if (file.meta.term !== term) throw new Error(`${entry.path}/index.json is for ${file.meta.term}, not ${term}`);
    return overlayIndex(base, file, entry);
  });
}

/**
 * A quarter's index if this page has already asked for it, without asking:
 * for a footnote that should never download a schedule of its own.
 */
export function peekIndexFor(term: string): Promise<PlatIndex> | null {
  return (merged.get(`index|${term}`) as Promise<PlatIndex> | undefined) ?? null;
}

/** One subject's courses for one quarter. 404 only when neither the shared nor the term's file has the subject. */
export function loadSubjectFor(sub: string, term: string): Promise<SubjectFile> {
  return memo(`subject|${term}|${sub}`, async () => {
    const entry = entryFor(term);
    if (entry.path === null) return loadSubject(sub);
    const url = `subject/${encodeURIComponent(sub)}.json`;
    const [base, file] = await Promise.all([orNull(loadSubject(sub)), orNull(termFile<TermSubjectFile>(entry, url))]);
    if (!base && !file) throw new HttpError(`/data/plat/${entry.path}/${url}`, 404);
    if (file && file.term !== term) throw new Error(`${entry.path}/${url} is for ${file.term}, not ${term}`);
    return overlaySubject(base, file, sub, entry);
  });
}

/** The professor index with "teaching this term" for one quarter. */
export function loadProfessorsFor(term: string): Promise<ProfessorFile> {
  return memo(`professors|${term}`, async () => {
    const entry = entryFor(term);
    if (entry.path === null) return loadProfessors();
    const [base, file] = await Promise.all([loadProfessors(), termFile<TermIndexFile>(entry, "index.json")]);
    return overlayProfessors(base, file);
  });
}

/** Whether a term's meetings publish rooms (and so pins, walks and final-exam rooms). */
export const termHasRooms = (term: string | null | undefined): boolean => termEntry(term ?? BASE_TERM)?.features.rooms ?? false;

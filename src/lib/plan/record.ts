import type { College, Course, CourseTime } from "@/components/triton/types";
import type { SectionSelection } from "@/lib/sections";
import { cleanChangeLog, type PlanChange } from "./change";

/**
 * What a student builds in UCSDPlans that should follow them to any device
 * they sign in on: the planner (program, this term's courses and sections, the
 * four-year plan), the courses they starred while browsing, and their own
 * ratings of this term's instructors.
 *
 * All three used to live only in the browser that made them, so signing in on
 * a phone showed an empty planner. They are now also kept with the account
 * (see store.ts and /api/plan), and this module is the one definition of their
 * shape. The same cleaners run in two places:
 *
 *  - on the server, over every request body, because a body has no more
 *    authority than any other input and a malformed plan saved once would
 *    break the planner on every device that loads it;
 *  - in the browser, over localStorage, which is editable by hand and outlives
 *    deploys, so nothing may assume it still holds what this build writes.
 *
 * A well-formed document passes through unchanged. That matters: the sync
 * compares what it sent with what the server kept, and a cleaner that rewrote
 * good data would make every device think it had something new to save.
 */

export type PlanYear = 1 | 2 | 3 | 4;
export type PlanQuarter = "Fall" | "Winter" | "Spring";

export interface ScheduleCourse {
  course: Course;
  /** One instance on the schedule; stable across devices once synced. */
  id: string;
}

export interface PlannedCourse {
  courseId: string;
  course: Course;
  year: PlanYear;
  quarter: PlanQuarter;
}

export interface PlannerDoc {
  major: string;
  minor: string;
  college: College | null;
  schedule: ScheduleCourse[];
  planned: PlannedCourse[];
  /** Saved codes already pushed onto the schedule, so removals stick. */
  synced: string[];
  /** Chosen sections per course: { "CSE 11": { family: "A", parts: { DI: "A01" } } } */
  sections: Record<string, SectionSelection>;
  /**
   * The term `schedule` and `sections` were picked from, as the dataset names
   * it ("FA26"). Absent on plans saved before plans recorded it, which were
   * all made against LEGACY_TERM's schedule (see term.ts).
   */
  term?: string;
  /** Earlier terms' schedules and section picks, by term. Absent when there are none. */
  past?: Record<string, PastTerm>;
  /**
   * Recent changes Plan with AI saved, oldest first, each with what reverses
   * it (see change.ts). Absent when there are none.
   */
  log?: PlanChange[];
}

/**
 * One term's "This term" picks, put away when the site moved on to the next
 * term's schedule. A section code like "A01" names a different section in
 * every term, so they are never read against another term's sections.
 */
export interface PastTerm {
  schedule: ScheduleCourse[];
  sections: Record<string, SectionSelection>;
}

/** One student's verdict on one instructor, for one course, in one term. */
export interface TermRating {
  /** 1-5. A rating without this is not a rating, and is dropped on read. */
  quality: number;
  /** 1-5, or 0 when the rater skipped it. */
  difficulty: number;
  /** null when the rater skipped it. */
  again: boolean | null;
  /** ISO-8601, set on save. */
  at: string;
}

export type TermRatings = Record<string, TermRating>;

/** Everything that follows the account, as one record. */
export interface PlanDocs {
  /** null until the planner has been opened on some device. */
  planner: PlannerDoc | null;
  shortlist: string[];
  ratings: TermRatings;
}

export const EMPTY_DOCS: PlanDocs = { planner: null, shortlist: [], ratings: {} };

/** What the planner shows before anyone has chosen anything. */
export const DEFAULT_MAJOR = "Computer Science (BS)";
export const DEFAULT_MINOR = "None";

/**
 * Generous for a real student — a full term, a twelve-quarter plan, years of
 * ratings — and tight enough that one account cannot use the store as hosting.
 */
export const MAX_PLAN_BYTES = 256 * 1024;
const MAX_SCHEDULE = 40;
const MAX_PLANNED = 120;
const MAX_SECTIONS = 200;
const MAX_CODES = 400;
const MAX_RATINGS = 500;
/** Earlier terms kept with a plan; the oldest beyond this are let go. */
export const MAX_PAST_TERMS = 3;

/** A term code as the dataset and Class Planner write it: "FA26", "WI27", "S127". */
export const TERM_CODE = /^[A-Z][A-Z0-9]\d{2}$/;

const COLLEGES = new Set<College>([
  "Revelle", "Muir", "Marshall", "Warren", "ERC", "Sixth", "Seventh", "Eighth",
]);
const QUARTERS = new Set<PlanQuarter>(["Fall", "Winter", "Spring"]);
const DAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);
const CLOCK = /^\d{1,2}:\d{2}$/;

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** A string no longer than `max`, else "". Never trimmed: good data must survive as sent. */
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

/** Non-empty strings, capped in number and length, without repeats. */
function codes(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<string>();
  for (const x of v) {
    if (out.size >= maxItems) break;
    const s = str(x, maxLen);
    if (s) out.add(s);
  }
  return [...out];
}

/**
 * Any JSON value, bounded in depth, breadth and length — for the Course fields
 * the planner only displays. Passing these through rather than listing them
 * means a field the client gains later survives a round trip instead of being
 * stripped by a server that has not heard of it.
 */
function bounded(v: unknown, depth = 3): unknown {
  if (v === null || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") return v.slice(0, 2000);
  if (depth <= 0 || typeof v !== "object") return undefined;
  if (Array.isArray(v)) {
    return v.slice(0, 40).map((x) => bounded(x, depth - 1)).filter((x) => x !== undefined);
  }
  const out: Obj = {};
  for (const [k, x] of Object.entries(v).slice(0, 30)) {
    const y = bounded(x, depth - 1);
    if (y !== undefined) out[k.slice(0, 40)] = y;
  }
  return out;
}

function times(v: unknown): CourseTime[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 14).flatMap((t) =>
    isObj(t) && DAYS.has(t.day as string) && CLOCK.test(str(t.start, 5)) && CLOCK.test(str(t.end, 5))
      ? [{ day: t.day as CourseTime["day"], start: t.start as string, end: t.end as string }]
      : [],
  );
}

/**
 * A course as the planner stores it. The fields the planner computes with are
 * checked and must be right; the rest are only bounded. No code, no course.
 */
function course(v: unknown): Course | null {
  if (!isObj(v)) return null;
  const code = str(v.code, 24);
  if (!code) return null;

  const out: Obj = {};
  for (const [k, x] of Object.entries(v).slice(0, 30)) {
    const y = bounded(x);
    if (y !== undefined) out[k.slice(0, 40)] = y;
  }
  out.code = code;
  out.id = str(v.id, 60) || code.toLowerCase().replace(/\s+/g, "");
  out.title = str(v.title, 200) || code;
  out.units = typeof v.units === "number" && Number.isFinite(v.units) && v.units >= 0 && v.units <= 30 ? v.units : 4;
  for (const k of ["departments", "categories", "genEd"] as const) {
    if (k in v) out[k] = codes(v[k], 20, 60);
  }
  if ("time" in v) {
    if (v.time === undefined) delete out.time;
    else out.time = times(v.time);
  }
  return out as unknown as Course;
}

function selection(v: unknown): SectionSelection | null {
  if (!isObj(v)) return null;
  const family = str(v.family, 16);
  if (!family) return null;
  const parts: Record<string, string> = {};
  if (isObj(v.parts)) {
    for (const [type, code] of Object.entries(v.parts).slice(0, 8)) {
      const c = str(code, 16);
      if (type && c) parts[type.slice(0, 8)] = c;
    }
  }
  return { family, parts };
}

/** A term's schedule: drawable entries, one per course, capped. */
function cleanSchedule(v: unknown): ScheduleCourse[] {
  const schedule: ScheduleCourse[] = [];
  const ids = new Set<string>();
  const onSchedule = new Set<string>();
  for (const e of Array.isArray(v) ? v : []) {
    if (schedule.length >= MAX_SCHEDULE) break;
    if (!isObj(e)) continue;
    const c = course(e.course);
    const id = str(e.id, 80);
    // One entry per course: the planner keys sections, colours and the map by code.
    if (!c || !id || ids.has(id) || onSchedule.has(c.code)) continue;
    ids.add(id);
    onSchedule.add(c.code);
    schedule.push({ course: c, id });
  }
  return schedule;
}

/** A term's section picks, by course code. */
function cleanSections(v: unknown): Record<string, SectionSelection> {
  const sections: Record<string, SectionSelection> = {};
  if (isObj(v)) {
    for (const [code, sel] of Object.entries(v).slice(0, MAX_SECTIONS)) {
      const s = selection(sel);
      if (code && code.length <= 24 && s) sections[code] = s;
    }
  }
  return sections;
}

/** Earlier terms' picks, by term code; an empty term is not worth keeping. */
function cleanPast(v: unknown): Record<string, PastTerm> {
  const past: Record<string, PastTerm> = {};
  if (!isObj(v)) return past;
  for (const [term, e] of Object.entries(v)) {
    if (Object.keys(past).length >= MAX_PAST_TERMS) break;
    if (!TERM_CODE.test(term) || !isObj(e)) continue;
    const schedule = cleanSchedule(e.schedule);
    const sections = cleanSections(e.sections);
    if (schedule.length || Object.keys(sections).length) past[term] = { schedule, sections };
  }
  return past;
}

/** The planner document, or null when there is nothing that could be one. */
export function cleanPlanner(v: unknown): PlannerDoc | null {
  if (!isObj(v)) return null;

  const schedule = cleanSchedule(v.schedule);

  const planned: PlannedCourse[] = [];
  const plannedIds = new Set<string>();
  for (const e of Array.isArray(v.planned) ? v.planned : []) {
    if (planned.length >= MAX_PLANNED) break;
    if (!isObj(e)) continue;
    const c = course(e.course);
    const courseId = str(e.courseId, 80);
    const year = e.year;
    const quarter = e.quarter as PlanQuarter;
    if (!c || !courseId || plannedIds.has(courseId)) continue;
    if (year !== 1 && year !== 2 && year !== 3 && year !== 4) continue;
    if (!QUARTERS.has(quarter)) continue;
    plannedIds.add(courseId);
    planned.push({ courseId, course: c, year, quarter });
  }

  const term = str(v.term, 8);
  const past = cleanPast(v.past);
  const log = cleanChangeLog(v.log);

  // `term`, `past` and `log` are left off when there is nothing to say, so a
  // plan saved before they existed passes through unchanged.
  return {
    major: str(v.major, 120) || DEFAULT_MAJOR,
    minor: str(v.minor, 120) || DEFAULT_MINOR,
    college: COLLEGES.has(v.college as College) ? (v.college as College) : null,
    schedule,
    planned,
    synced: codes(v.synced, MAX_CODES, 24),
    sections: cleanSections(v.sections),
    ...(TERM_CODE.test(term) ? { term } : {}),
    ...(Object.keys(past).length ? { past } : {}),
    ...(log.length ? { log } : {}),
  };
}

/** Starred course codes, in the order they were starred. */
export function cleanShortlist(v: unknown): string[] {
  return codes(v, MAX_CODES, 24);
}

/** Whole numbers 0-5. Anything unparseable becomes 0 rather than NaN. */
export function clamp5(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  const v = Math.round(n);
  return v < 0 ? 0 : v > 5 ? 5 : v;
}

/** Ratings with a quality score, anything malformed dropped. */
export function cleanRatings(v: unknown): TermRatings {
  if (!isObj(v)) return {};
  const out: TermRatings = {};
  for (const [k, r] of Object.entries(v).slice(0, MAX_RATINGS)) {
    if (!isObj(r) || !k || k.length > 200) continue;
    const quality = clamp5(r.quality);
    if (quality < 1) continue;
    out[k] = {
      quality,
      difficulty: clamp5(r.difficulty),
      again: typeof r.again === "boolean" ? r.again : null,
      at: str(r.at, 40),
    };
  }
  return out;
}

/** The whole record, rebuilt part by part. Anything unrecognised is dropped. */
export function cleanDocs(v: unknown): PlanDocs {
  if (!isObj(v)) return { planner: null, shortlist: [], ratings: {} };
  return {
    planner: cleanPlanner(v.planner),
    shortlist: cleanShortlist(v.shortlist),
    ratings: cleanRatings(v.ratings),
  };
}

/**
 * A planner nobody has touched: the defaults and nothing on it.
 *
 * Such a document says nothing about the student, so a device holding one
 * must not be allowed to overrule a plan the account already has.
 */
export function isBlankPlanner(p: PlannerDoc | null): boolean {
  return !p || (
    p.major === DEFAULT_MAJOR && p.minor === DEFAULT_MINOR && p.college === null &&
    !p.schedule.length && !p.planned.length && !p.synced.length && !Object.keys(p.sections).length &&
    !Object.keys(p.past ?? {}).length && !p.log?.length
  );
}

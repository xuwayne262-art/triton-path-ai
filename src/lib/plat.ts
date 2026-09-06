/**
 * UCSDPlans — course-discovery data layer.
 *
 * Everything here reads the static JSON emitted by scripts/build-plat-data.mjs
 * into /public/data/plat. Files are fetched once per page load and memoized on
 * the module, so navigating between routes never refetches.
 */

// ── Wire types (short keys keep the 8k-course index small) ───────────────────

/** One catalog course, as it appears in index.json. */
export interface CourseRow {
  k: string;          // "CSE 11"
  s: string;          // subject      "CSE"
  c: string;          // number       "11"
  t: string;          // title
  u: string | null;   // units        "4.00"
  g: number | null;   // historical average GPA
  a: number | null;   // historical A rate, percent
  r: number;          // number of graded terms behind g/a
  o: 0 | 1;           // offered this term
  pr: 0 | 1;          // has prerequisites
  ge?: string[];      // GE area keys, "revelle:Mathematics"
  sa: number | null;  // seats available
  sl: number | null;  // seat limit
  d: string | null;   // meeting days "TuTh"
  st: string | null;  // start        "9:30a"
  en: string | null;  // end          "10:50a"
  b: string | null;   // building
  p: string | null;   // instructor this term
  pq: number | null;  // that instructor's RateMyProfessors quality
  pn: number | null;  // ...number of ratings
  pa: number | null;  // ...historical A rate
  pd: number | null;  // ...RateMyProfessors difficulty, drives the workload tag
  pg: number | null;  // ...their own average GPA for this course
}

export interface Subject {
  code: string;
  name: string;
  n: number;
  offered: number;
}

export interface IndexMeta {
  term: string;
  termName: string;
  generated: string;
  years: string;
  gradeRecords: number;
  catalogCourses: number;
  offered: number;
  buildings: Record<string, [number, number]>;
  sources: string[];
}

export interface PlatIndex {
  meta: IndexMeta;
  subjects: Subject[];
  courses: CourseRow[];
}

/** A single instructor's historical grade distribution for one course. */
export interface ProfRecord {
  i: string;
  g: number;
  A: number; B: number; C: number; D: number; F: number;
  W: number; P: number; NP: number;
  n: number;
  y: number | null;
  cur: 0 | 1;
  rq: number | null;
  rd: number | null;
  rw: number | null;
  rn: number | null;
  rid: number | null;
}

/** schedule.json section tuple: code, type, days, start, end, building, room, instructor, seatsAvail, seatsLimit, cancelled */
export type SectionTuple = [
  string, string, string, string, string,
  string, string, string,
  number | null, number | null, number,
];

export interface CourseDetail {
  t: string;
  u: string | null;
  pre: string | null;
  ge: string[];
  gpa: number | null;
  aRate: number | null;
  terms: number;
  offered: 0 | 1;
  seatUrl: string | null;
  fa: string[];
  profs: ProfRecord[];
  sec: SectionTuple[];
}

export interface SubjectFile {
  code: string;
  name: string;
  term: string;
  termName: string;
  courses: Record<string, CourseDetail>;
}

export interface GEArea {
  key: string;
  college: string;
  area: string;
  n: number;
}

export interface GEFile {
  meta: { date: string; note: string };
  areas: GEArea[];
  lists: Record<string, string[]>;
}

// ── Loaders ──────────────────────────────────────────────────────────────────

const cache = new Map<string, Promise<unknown>>();

function loadJSON<T>(url: string): Promise<T> {
  let hit = cache.get(url);
  if (!hit) {
    hit = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return r.json();
    });
    cache.set(url, hit);
  }
  return hit as Promise<T>;
}

export const loadIndex = () => loadJSON<PlatIndex>("/data/plat/index.json");
export const loadGE = () => loadJSON<GEFile>("/data/plat/ge.json");
export const loadSubject = (sub: string) =>
  loadJSON<SubjectFile>(`/data/plat/subject/${encodeURIComponent(sub)}.json`);

// ── Enrollment calendar ──────────────────────────────────────────────────────

export interface Pass {
  label: string;
  date: Date;
}

/** The three Fall 2026 enrollment passes. Times are 8am Pacific. */
export const ENROLLMENT_PASSES: Pass[] = [
  { label: "Pass 1", date: new Date("2026-07-22T08:00:00-07:00") },
  { label: "Pass 2", date: new Date("2026-08-17T08:00:00-07:00") },
  { label: "Pass 3", date: new Date("2026-09-12T08:00:00-07:00") },
];

/** "Jul 22" — the label under each marker. */
export function passDate(pass: Pass): string {
  return pass.date.toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "America/Los_Angeles",
  });
}

export function nextPass(now = new Date()): { pass: Pass; days: number } | null {
  const upcoming = ENROLLMENT_PASSES.find((p) => p.date.getTime() > now.getTime());
  if (!upcoming) return null;
  const days = Math.ceil((upcoming.date.getTime() - now.getTime()) / 86_400_000);
  return { pass: upcoming, days };
}

// useSyncExternalStore compares snapshots by identity, so this must hand back the
// same object every call — returning a fresh nextPass() would re-render forever.
let countdownCache: { pass: Pass; days: number } | null | undefined;

/** Client snapshot of the countdown; the server renders nothing. */
export function countdownSnapshot() {
  if (countdownCache === undefined) countdownCache = nextPass();
  return countdownCache;
}
export const countdownServerSnapshot = () => null;
/** The countdown only changes by the day, so there is nothing to subscribe to. */
export const noopSubscribe = () => () => {};

/** How far through the enrollment cycle we are, 0-1, for the progress bar. */
export function passProgress(now = new Date()): number {
  const first = ENROLLMENT_PASSES[0].date.getTime();
  const last = ENROLLMENT_PASSES[ENROLLMENT_PASSES.length - 1].date.getTime();
  return Math.min(1, Math.max(0, (now.getTime() - first) / (last - first)));
}

export interface PassMark {
  pass: Pass;
  /** Already opened. */
  done: boolean;
  /** The one being counted down to. */
  next: boolean;
}

export interface PassTimelineState {
  marks: PassMark[];
  /** 0-1 along the bar. */
  progress: number;
  countdown: { pass: Pass; days: number } | null;
}

// Same identity-stable trick as the countdown above: useSyncExternalStore
// compares snapshots by reference, so this is computed once per page load.
let timelineCache: PassTimelineState | undefined;

/** Client snapshot of the whole timeline; the server renders nothing. */
export function timelineSnapshot(): PassTimelineState {
  if (timelineCache === undefined) {
    const now = new Date();
    const upcoming = nextPass(now);
    timelineCache = {
      marks: ENROLLMENT_PASSES.map((pass) => ({
        pass,
        done: pass.date.getTime() <= now.getTime(),
        next: upcoming?.pass === pass,
      })),
      progress: passProgress(now),
      countdown: upcoming,
    };
  }
  return timelineCache;
}
export const timelineServerSnapshot = () => null;

// ── Grade / rating presentation ──────────────────────────────────────────────

export interface Tier {
  /** Tailwind classes for a filled pill. */
  pill: string;
  /** Bare text color, for inline numbers. */
  text: string;
  /** Solid hex, for bars and charts. */
  hex: string;
  label: string;
}

const A_TIERS: [number, Tier][] = [
  [60, { pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300", text: "text-emerald-600 dark:text-emerald-400", hex: "#059669", label: "Very generous" }],
  [45, { pill: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300", text: "text-green-600 dark:text-green-400", hex: "#16a34a", label: "Generous" }],
  [32, { pill: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300", text: "text-amber-600 dark:text-amber-400", hex: "#d97706", label: "Average" }],
  [20, { pill: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300", text: "text-orange-600 dark:text-orange-400", hex: "#ea580c", label: "Tough" }],
  [0, { pill: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300", text: "text-red-600 dark:text-red-400", hex: "#dc2626", label: "Brutal" }],
];

const NEUTRAL: Tier = {
  pill: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
  text: "text-gray-500 dark:text-gray-400",
  hex: "#9ca3af",
  label: "No data",
};

/** Color tier for an average GPA, mapped onto the same scale. */
export function gpaTier(g: number | null | undefined): Tier {
  if (g == null || g <= 0) return NEUTRAL;
  if (g >= 3.7) return A_TIERS[0][1];
  if (g >= 3.4) return A_TIERS[1][1];
  if (g >= 3.0) return A_TIERS[2][1];
  if (g >= 2.6) return A_TIERS[3][1];
  return A_TIERS[4][1];
}

// ── The one headline signal ──────────────────────────────────────────────────
// Students think in letter grades, not in "49.6% A / 3.19 GPA / score 52". One
// letter answers "how did people actually do here", and everything else becomes
// a detail you can open rather than a number competing for attention.

export interface Verdict {
  letter: string;
  tier: Tier;
  /** True when the history is too thin to lean on. */
  thin: boolean;
}

const LETTER_CUTS: [number, string][] = [
  [3.85, "A"], [3.5, "A−"], [3.15, "B+"], [2.85, "B"],
  [2.5, "B−"], [2.15, "C+"], [1.85, "C"], [0, "C−"],
];

/** Average GPA -> the letter a typical student walks away with. */
export function typicalGrade(gpa: number | null | undefined, terms = 0): Verdict | null {
  if (gpa == null || gpa <= 0) return null;
  const letter = (LETTER_CUTS.find(([min]) => gpa >= min) ?? LETTER_CUTS[LETTER_CUTS.length - 1])[1];
  return { letter, tier: gpaTier(gpa), thin: terms > 0 && terms < 2 };
}

export type Load = { label: string; text: string } | null;

/** RateMyProfessors difficulty (1-5) -> plain-language workload. */
export function workload(difficulty: number | null | undefined): Load {
  if (difficulty == null || difficulty <= 0) return null;
  if (difficulty <= 2.2) return { label: "Light", text: "text-emerald-600 dark:text-emerald-400" };
  if (difficulty <= 3.2) return { label: "Moderate", text: "text-amber-600 dark:text-amber-400" };
  if (difficulty <= 4.0) return { label: "Heavy", text: "text-orange-600 dark:text-orange-400" };
  return { label: "Brutal", text: "text-red-600 dark:text-red-400" };
}

/**
 * Seats only earn screen space when they change a decision. "402 of 410 open"
 * is noise; "8 left" is not.
 */
export function seatWarning(avail: number | null, limit: number | null): string | null {
  if (avail == null || limit == null || limit === 0) return null;
  if (avail === 0) return "Full";
  if (avail / limit <= 0.15) return `${avail} left`;
  return null;
}

// ── Schedule formatting ──────────────────────────────────────────────────────

const DAY_TOKENS = ["Su", "M", "Tu", "W", "Th", "F", "S"];

/** "TuTh" -> ["Tu", "Th"] */
export function splitDays(days: string | null | undefined): string[] {
  if (!days) return [];
  const out: string[] = [];
  let i = 0;
  while (i < days.length) {
    const two = days.slice(i, i + 2);
    if (DAY_TOKENS.includes(two)) { out.push(two); i += 2; continue; }
    const one = days[i];
    if (DAY_TOKENS.includes(one)) { out.push(one); i += 1; continue; }
    i += 1;
  }
  return out;
}

/** "9:30a" -> minutes past midnight. Returns null for dates or blanks. */
export function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})\s*([ap])$/i.exec(t.trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "p") h += 12;
  return h * 60 + Number(m[2]);
}

/** "9:30a" -> "9:30 AM" */
export function prettyTime(t: string | null | undefined): string {
  if (!t) return "";
  const m = /^(\d{1,2}):(\d{2})\s*([ap])$/i.exec(t.trim());
  if (!m) return t;
  return `${m[1]}:${m[2]} ${m[3].toUpperCase()}M`;
}

export function prettyRange(start: string | null, end: string | null): string {
  if (!start) return "TBA";
  return `${prettyTime(start)} – ${prettyTime(end)}`;
}

export const SECTION_TYPES: Record<string, string> = {
  LE: "Lecture", DI: "Discussion", LA: "Lab", SE: "Seminar", ST: "Studio",
  FI: "Final Exam", MI: "Midterm", TU: "Tutorial", PR: "Practicum",
  FW: "Fieldwork", CL: "Clinical", IN: "Independent", OT: "Other",
};

/**
 * WebReg publishes *open* seats, and this snapshot predates enrollment, so most
 * sections are still empty. Reporting seats open is both truer to the source and
 * the number a student actually decides on — "2 / 35 enrolled" tells them
 * nothing, "33 open" tells them they can get in.
 */
export function seatState(avail: number | null, limit: number | null) {
  if (avail == null || limit == null || limit === 0) {
    return { known: false as const, open: 0, limit: 0, full: false, tight: false, label: "Seats TBA" };
  }
  const open = Math.max(0, avail);
  return {
    known: true as const,
    open,
    limit,
    full: open === 0,
    tight: open > 0 && open / limit <= 0.15,
    label: open === 0 ? "Full" : `${open} of ${limit} open`,
  };
}

// ── Search ───────────────────────────────────────────────────────────────────

const COLLEGE_NAMES: Record<string, string> = {
  revelle: "Revelle", muir: "Muir", marshall: "Marshall", warren: "Warren",
  erc: "ERC", sixth: "Sixth", seventh: "Seventh", eighth: "Eighth",
};

export const collegeName = (slug: string) => COLLEGE_NAMES[slug] ?? slug;

export function geLabel(key: string): string {
  const [college, ...rest] = key.split(":");
  return `${collegeName(college)} · ${rest.join(":")}`;
}

/** Normalizes "cse11", "CSE 11", "cse-11" to a comparable form. */
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface SearchHit {
  row: CourseRow;
  score: number;
}

/**
 * Ranks courses against a free-text query. Exact code matches win, then code
 * prefixes, then title words, then instructor names.
 */
export function searchCourses(courses: CourseRow[], query: string, limit = 30): SearchHit[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const sq = squash(q);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits: SearchHit[] = [];

  for (const row of courses) {
    const code = squash(row.k);
    let score = 0;

    if (code === sq) score = 1000;
    else if (code.startsWith(sq)) score = 800 - code.length;
    else if (code.includes(sq)) score = 600 - code.length;

    if (!score) {
      const title = row.t.toLowerCase();
      const matched = words.filter((w) => title.includes(w)).length;
      if (matched === words.length) score = 400 + matched * 10;
    }

    if (!score && row.p) {
      const prof = row.p.toLowerCase();
      const matched = words.filter((w) => prof.includes(w)).length;
      if (matched === words.length) score = 300;
    }

    if (score) {
      // Nudge courses actually offered this term, and those with real history.
      score += row.o ? 40 : 0;
      score += Math.min(row.r, 10);
      hits.push({ row, score });
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ── Sorting ──────────────────────────────────────────────────────────────────

/**
 * Three sorts, not six. "Easiest A", "more A's" and "highest GPA" were three
 * spellings of the same question, and offering all of them made the user pick
 * a statistic instead of picking a course.
 */
export type SortKey = "grade" | "code" | "rating";

export function sortCourses(rows: CourseRow[], key: SortKey): CourseRow[] {
  const num = (c: CourseRow) => parseInt(c.c, 10) || 9999;
  const out = [...rows];
  switch (key) {
    case "grade":
      // Thin histories get pulled toward the middle so one lucky quarter cannot
      // outrank a course with a decade of evidence behind it.
      return out.sort((a, b) => confidentGpa(b) - confidentGpa(a));
    case "rating":
      return out.sort((a, b) => (b.pq ?? -1) - (a.pq ?? -1));
    case "code":
    default:
      // Level band first, so a department spanning several prefixes leads with
      // lower-division undergraduate courses rather than whichever prefix
      // happens to sort first alphabetically (Biology opened on graduate BGGN).
      return out.sort(
        (a, b) =>
          levelBand(a) - levelBand(b) ||
          a.s.localeCompare(b.s) ||
          num(a) - num(b) ||
          a.c.localeCompare(b.c),
      );
  }
}

/** 0 = lower division, 1 = upper division, 2 = graduate. */
export function levelBand(c: CourseRow): number {
  const n = parseInt(c.c, 10) || 0;
  if (n >= 200) return 2;
  if (n >= 100) return 1;
  return 0;
}

/** Average GPA shrunk toward the ~3.2 campus mean when the sample is small. */
export function confidentGpa(c: CourseRow): number {
  if (c.g == null || c.g <= 0) return -1;
  const weight = Math.min(1, c.r / 4);
  return c.g * weight + 3.2 * (1 - weight);
}

/** Route helper — "CSE 11" becomes /course/CSE/11. */
export const courseHref = (code: string) => {
  const i = code.lastIndexOf(" ");
  return `/course/${encodeURIComponent(code.slice(0, i))}/${encodeURIComponent(code.slice(i + 1))}`;
};

// ── Professors ───────────────────────────────────────────────────────────────
// Search used to look only at `row.p`, the instructor named on this term's
// schedule, which made roughly four in five instructors in the grade history
// unfindable. This index covers everyone who has ever appeared.

/** [course code, avg GPA, graded terms, teaching now, A rate] */
export type ProfCourse = [string, number | null, number, 0 | 1, number | null];

export interface ProfessorRecord {
  n: string;
  /** Other spellings, e.g. the schedule's "Joe Politz". */
  a?: string[];
  q: number | null;   // RateMyProfessors quality
  nr: number | null;  // number of ratings
  d: number | null;   // difficulty
  w: number | null;   // would take again, percent
  id: number | null;  // RateMyProfessors id
  cur: 0 | 1;         // teaching this term
  terms: number;
  gpa: number | null;
  c: ProfCourse[];
}

export interface ProfessorFile {
  meta: { term: string };
  professors: ProfessorRecord[];
}

export const loadProfessors = () =>
  loadJSON<ProfessorFile>("/data/plat/professors.json");

/** URL-safe slug for a professor page. */
export const professorSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const professorHref = (name: string) => `/professor/${professorSlug(name)}`;

export interface ProfHit {
  prof: ProfessorRecord;
  score: number;
}

/**
 * Ranks instructors by name, matching any recorded spelling. Surname matches
 * rank above scattered first-name matches, and someone teaching this term
 * outranks an identically-named person who is not.
 */
export function searchProfessors(
  profs: ProfessorRecord[],
  query: string,
  limit = 5,
): ProfHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const hits: ProfHit[] = [];

  for (const prof of profs) {
    const names = [prof.n, ...(prof.a ?? [])];
    let best = 0;

    for (const name of names) {
      const lower = name.toLowerCase();
      const surname = lower.split(/\s+/).pop() ?? "";
      let score = 0;

      if (lower === q) score = 1000;
      else if (surname === q) score = 900;
      else if (surname.startsWith(q)) score = 800;
      else if (lower.startsWith(q)) score = 700;
      else if (words.length > 1 && words.every((w) => lower.includes(w))) score = 600;
      else if (words.length === 1 && lower.includes(q)) score = 400;

      best = Math.max(best, score);
    }

    if (!best) continue;
    // Prefer people you can actually enrol with, and better-evidenced records.
    best += prof.cur ? 120 : 0;
    best += Math.min(prof.nr ?? 0, 100) / 10;
    best += Math.min(prof.terms, 20);
    hits.push({ prof, score: best });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

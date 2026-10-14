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
  ct?: 0;             // present only when UCSD's current catalog does not list it
  ge?: string[];      // GE area keys, "revelle:Mathematics"
  sa: number | null;  // seats available
  sl: number | null;  // seat limit
  /** When the oldest count behind sa/sl was taken, "2026-09-21T13:01Z"; absent when Class Planner gave no time. */
  sat?: string;
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
  /** When the grade archive was retrieved, "2026-08-23". */
  generated: string;
  /** When UCSD last refreshed this term's listings in Class Planner, "2026-09-25 15:53:24+00". */
  refreshed?: string | null;
  /** When this dataset read Class Planner, ISO-8601. Never a seat time: re-reading an old count does not renew it. */
  retrieved?: string | null;
  /** The oldest seat count on the schedule, ISO-8601. */
  seatsAsOf?: string | null;
  /** The newest seat count on the schedule; with seatsAsOf, the span the term's counts were taken over. */
  seatsNewest?: string | null;
  /** Class Planner's own count of the term's listings when it was taken. */
  counts?: { courses: number | null; sections: number | null; meetings: number | null } | null;
  years: string;
  gradeRecords: number;
  catalogCourses: number;
  offered: number;
  sources: string[];
}

/** "2026-09-25 15:53:24+00" -> "Sep 25, 2026" in San Diego; null when unreadable. */
export function refreshedLabel(refreshed: string | null | undefined): string | null {
  if (!refreshed) return null;
  const iso = refreshed.trim().replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles",
  });
}

/** "2026-09-25 15:53:24+00" -> "2026-09-25", the San Diego date it happened on; null when unreadable. */
export function refreshedDay(refreshed: string | null | undefined): string | null {
  if (!refreshed) return null;
  const iso = refreshed.trim().replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

/**
 * "2026-12-11" -> "Fri, Dec 11": the one way the site writes a calendar date.
 * Finals printed as "2026-12-11" on a course page and "Sat, Dec 5" in the
 * planner. `year` adds ", 2026"; `weekday: false` drops "Fri, ". The date is
 * read as a date, not an instant, so no time zone can move it a day. Anything
 * that is not YYYY-MM-DD comes back unchanged.
 */
export function dayLabel(iso: string, { weekday = true, year = false } = {}): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  if (!m) return iso;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).toLocaleDateString("en-US", {
    ...(weekday ? { weekday: "short" as const } : {}),
    month: "short",
    day: "numeric",
    ...(year ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  });
}

/** One campus building, keyed by its code ("CENTR") in buildings.json. */
export interface Building {
  /** What the schedule calls it: "Ledden Auditorium". */
  n: string;
  /** The structure UCSD's map files it under, when that differs: "Humanities and Social Sciences". */
  m?: string;
  /** [latitude, longitude] */
  ll: [number, number];
  /** Street address, when UCSD publishes one. */
  a?: string;
}

export interface BuildingsFile {
  term: string;
  buildings: Record<string, Building>;
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

/**
 * One section meeting, as a positional tuple to keep the per-subject JSON small.
 *
 * Positions 0-10 are the original WebReg-era fields and are frozen: code, type,
 * days, start, end, building, room, instructor, seatsAvail, seatsLimit,
 * cancelled. Everything from 11 on arrived with UCSD's Class Planner and is
 * appended rather than inserted, so any reader that only knows the first eleven
 * keeps working.
 */
export type SectionTuple = [
  string, string, string, string, string,
  string, string, string,
  number | null, number | null, number,
  // 11 waitlisted · 12 enrolled · 13 TSS section id · 14 TSS package ids
  // 15 start, minutes from midnight · 16 end, same
  number, number | null, string, string[], number | null, number | null,
  // 17 building code, "" when TBA or remote · 18 Class Planner status
  // 19 topic, for a topics course listed once per topic ("" otherwise)
  // 20 when Class Planner counted this section's seats, "" when it did not say
  string?, string?, string?, string?,
];

/**
 * One instructor's grades for one term, as published:
 * [term "FA25", index into the course's `profs`, GPA or null, A, B, C, D, F, W, P, NP].
 * The letter columns are percentages of the class.
 */
export type TermGrades = [
  string, number, number | null,
  number, number, number, number, number, number, number, number,
];

export interface CourseDetail {
  t: string;
  u: string | null;
  /** The catalog's description, without its closing prerequisite sentence. */
  desc?: string | null;
  pre: string | null;
  /** Courses whose prerequisites name this one, alone or as one option. */
  unl?: string[];
  /** Every published term of grades, newest first. */
  hist?: TermGrades[];
  ge: string[];
  gpa: number | null;
  aRate: number | null;
  terms: number;
  offered: 0 | 1;
  seatUrl: string | null;
  /** TSS booking URL for this course, or null when UCSD lists no module for it. */
  tss: string | null;
  /** Enrolment restrictions, as the registrar words them. */
  res: string | null;
  fa: string[];
  /**
   * The oldest seat count among this course's sections, ISO-8601: the most a
   * course-wide "seats as of" can claim. Each section's own time is in its
   * tuple (position 20). Absent when Class Planner gave no time. In data built
   * before sections were dated it was one lecture's time, not the course's,
   * so it is only read alongside per-section times (see lib/freshness.ts).
   */
  seatsAt?: string;
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

/** Where a university requirement's list came from, for the page that shows it. */
export interface RequirementSource {
  source: string;
  url: string;
  retrieved: string;
  note?: string;
  termUrl?: string;
  termName?: string | null;
  asOf?: string | null;
}

export interface GEFile {
  meta: {
    date: string;
    note: string;
    /** The university requirements, when the build had their lists. */
    campus?: { ahi: RequirementSource; dei: RequirementSource };
  };
  areas: GEArea[];
  lists: Record<string, string[]>;
}

// ── Loaders ──────────────────────────────────────────────────────────────────

/** A dataset file the server answered with an error status — 404 means it does not exist. */
export class HttpError extends Error {
  readonly url: string;
  readonly status: number;

  constructor(url: string, status: number) {
    super(`${url}: HTTP ${status}`);
    this.name = "HttpError";
    this.url = url;
    this.status = status;
  }
}

const cache = new Map<string, Promise<unknown>>();

/**
 * Fetches a dataset file once per page load. A failure is not remembered: it
 * used to be cached like a success, so one dropped request on a phone left that
 * subject broken until a full reload, however many times it was asked for again.
 *
 * `prepare` runs once on the parsed file, before anything sees it.
 */
export function loadJSON<T>(url: string, prepare?: (file: T) => T): Promise<T> {
  let hit = cache.get(url);
  if (!hit) {
    const request = fetch(url).then(async (r) => {
      if (!r.ok) throw new HttpError(url, r.status);
      const file = (await r.json()) as T;
      return prepare ? prepare(file) : file;
    });
    request.catch(() => {
      if (cache.get(url) === request) cache.delete(url);
    });
    hit = request;
    cache.set(url, hit);
  }
  return hit as Promise<T>;
}

/**
 * "Introductory Ecology—Organisms and Habitat" -> "Introductory Ecology: Organisms and Habitat".
 * The catalog joins a title and its subtitle with an em dash (108 titles); the
 * site writes no em dashes, so it reads them as a colon, or a comma where the
 * title already has a colon ("Remote, Introduction to Ethnic Studies: Land and
 * Labor"). One between numbers is a range and becomes an en dash: "(4—6)" ->
 * "(4–6)". En dashes already are ranges ("K–12") and stay as they are. Only the
 * title as shown changes; the published data keeps the catalog's own text.
 */
export function tidyTitle(title: string): string {
  if (typeof title !== "string") return title;
  const ranged = title.replace(/(\d)\s*—\s*(\d)/g, "$1–$2");
  return ranged.replace(/\s*—\s*/g, ranged.includes(":") ? ", " : ": ");
}

export const loadIndex = () =>
  loadJSON<PlatIndex>("/data/plat/index.json", (file) => {
    for (const c of file.courses) c.t = tidyTitle(c.t);
    return file;
  });
export const loadGE = () => loadJSON<GEFile>("/data/plat/ge.json");
export const loadBuildings = () => loadJSON<BuildingsFile>("/data/plat/buildings.json");
export const loadSubject = (sub: string) =>
  loadJSON<SubjectFile>(`/data/plat/subject/${encodeURIComponent(sub)}.json`, (file) => {
    for (const c of Object.values(file.courses)) c.t = tidyTitle(c.t);
    return file;
  });

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

const TIER = {
  veryGenerous: { pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300", text: "text-emerald-600 dark:text-emerald-400", hex: "#059669", label: "Very generous" },
  generous: { pill: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300", text: "text-green-600 dark:text-green-400", hex: "#16a34a", label: "Generous" },
  average: { pill: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300", text: "text-amber-600 dark:text-amber-400", hex: "#d97706", label: "Average" },
  tough: { pill: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300", text: "text-orange-600 dark:text-orange-400", hex: "#ea580c", label: "Tough" },
  brutal: { pill: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300", text: "text-red-600 dark:text-red-400", hex: "#dc2626", label: "Brutal" },
} satisfies Record<string, Tier>;

const NEUTRAL: Tier = {
  pill: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
  text: "text-gray-500 dark:text-gray-400",
  hex: "#9ca3af",
  label: "No data",
};

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

/**
 * Average GPA -> the nearest official UCSD grade point, and the colour that
 * letter always wears.
 *
 * Each cut is the midpoint between two grade points (A 4.0 and A− 3.7 meet at
 * 3.85). The colour used to follow a scale of its own — green from 3.40, amber
 * from 3.00 — so one letter came in two colours: a B+ at 3.45 was green and a
 * B+ at 3.30 amber, and A−, B and B− were split the same way. Colour is now a
 * property of the letter, so the same letter always looks the same.
 */
export const LETTER_SCALE: readonly (readonly [min: number, letter: string, tier: Tier])[] = [
  [3.85, "A", TIER.veryGenerous],
  [3.5, "A−", TIER.generous],
  [3.15, "B+", TIER.average],
  [2.85, "B", TIER.tough],
  [2.5, "B−", TIER.tough],
  [2.15, "C+", TIER.brutal],
  [1.85, "C", TIER.brutal],
  [1.5, "C−", TIER.brutal],
  [1.15, "D+", TIER.brutal],
  [0.85, "D", TIER.brutal],
  [0.35, "D−", TIER.brutal],
  [0, "F", TIER.brutal],
];

const onScale = (gpa: number) =>
  LETTER_SCALE.find(([min]) => gpa >= min) ?? LETTER_SCALE[LETTER_SCALE.length - 1];

/** Colour for an average GPA: the colour of the letter it rounds to. */
export function gpaTier(g: number | null | undefined): Tier {
  if (g == null || g <= 0) return NEUTRAL;
  return onScale(g)[2];
}

/** Average GPA -> the letter a typical student walks away with. */
export function typicalGrade(gpa: number | null | undefined, terms = 0): Verdict | null {
  if (gpa == null || gpa <= 0) return null;
  const [, letter, tier] = onScale(gpa);
  return { letter, tier, thin: terms > 0 && terms < 2 };
}

/**
 * RateMyProfessors quality (1-5) -> the colour every rating on the site wears.
 * The course and professor pages and the search dropdown painted every rating
 * amber, so a 4.8 there looked like the 3.2 the lists colour amber.
 */
export function ratingTone(q: number | null | undefined): string {
  // The 700 shades in light mode: at the 12px these numbers are set in, 600
  // measured 3.2–3.7:1 against white, under the 4.5:1 small text needs.
  if (q == null || q <= 0) return "text-gray-600 dark:text-gray-400";
  if (q >= 4) return "text-emerald-700 dark:text-emerald-400";
  if (q >= 3) return "text-amber-700 dark:text-amber-400";
  return "text-red-700 dark:text-red-400";
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
  FW: "Fieldwork", CL: "Clinical", IN: "Independent study", OT: "Other",
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
  revelle: "Revelle College", muir: "Muir College", marshall: "Marshall College", warren: "Warren College",
  erc: "Eleanor Roosevelt College", sixth: "Sixth College", seventh: "Seventh College", eighth: "Eighth College",
};

/**
 * A college's one name on the site: "seventh" (a GE key) and "Seventh" (the
 * planner's choice) are both "Seventh College", and "ERC" is written out. It
 * was "Warren" in one place, "Warren College" in another and "Warren GEs" in
 * a third.
 */
export const collegeName = (college: string) => COLLEGE_NAMES[college.toLowerCase()] ?? college;

/** "Warren College GE requirements" — the heading for a college's GE set, wherever it appears. */
export const collegeGEs = (college: string) => `${collegeName(college)} GE requirements`;

/**
 * The requirements every undergraduate owes whatever their college. The data
 * files them as GE areas of the pseudo-college "campus"; UCSD calls them
 * university requirements.
 */
export const CAMPUS = "campus";
export const UNIVERSITY_REQUIREMENTS: Record<string, string> = {
  DEI: "Diversity, Equity & Inclusion (DEI)",
  AHI: "American History & Institutions (AHI)",
};

/** "campus:DEI" -> "DEI"; null for a college's own GE key. */
export const universityRequirement = (key: string): string | null =>
  key.startsWith(`${CAMPUS}:`) ? key.slice(CAMPUS.length + 1) : null;

/**
 * "seventh:Alternatives · Humanities" -> "Seventh College GE · Alternatives · Humanities"
 * "campus:DEI" -> "University requirement · Diversity, Equity & Inclusion (DEI)"
 */
export function geLabel(key: string): string {
  const req = universityRequirement(key);
  if (req) return `University requirement · ${UNIVERSITY_REQUIREMENTS[req] ?? req}`;
  const [college, ...rest] = key.split(":");
  return `${collegeName(college)} GE · ${rest.join(":")}`;
}

// ── Terms ────────────────────────────────────────────────────────────────────

const QUARTER_NAMES: Record<string, string> = {
  FA: "Fall", WI: "Winter", SP: "Spring", SU: "Summer",
  S1: "Summer Session I", S2: "Summer Session II", S3: "Summer Session III",
};
const QUARTER_ORDER: Record<string, number> = { WI: 1, SP: 2, S1: 3, S2: 3, S3: 3, SU: 3, FA: 4 };

/** "FA25" -> "Fall 2025"; anything else comes back unchanged. */
export function termName(code: string): string {
  const m = /^([A-Z][A-Z0-9])(\d{2})$/.exec(code);
  return m && QUARTER_NAMES[m[1]] ? `${QUARTER_NAMES[m[1]]} 20${m[2]}` : code;
}

/** Chronological sort key: "WI25" < "SP25" < "FA25" < "WI26". */
export function termOrder(code: string): number {
  const m = /^([A-Z][A-Z0-9])(\d{2})$/.exec(code);
  return m ? Number(m[2]) * 10 + (QUARTER_ORDER[m[1]] ?? 0) : -1;
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

/** The average GPA, or -1 for a course with no published history, which sorts last. */
const gradeKey = (c: CourseRow) => (c.g != null && c.g > 0 ? c.g : -1);

/** This term's instructor's rating, or -1 when there is none. */
const ratingKey = (c: CourseRow) => (c.pq != null && c.pq > 0 ? c.pq : -1);

/**
 * Level band first, so a department spanning several prefixes leads with
 * lower-division undergraduate courses rather than whichever prefix happens to
 * sort first alphabetically (Biology opened on graduate BGGN). Also the last
 * tie-break of every other sort, so equal rows always come out in one order.
 */
function byCode(a: CourseRow, b: CourseRow): number {
  const num = (c: CourseRow) => parseInt(c.c, 10) || 9999;
  return levelBand(a) - levelBand(b) || a.s.localeCompare(b.s) || num(a) - num(b) || a.c.localeCompare(b.c);
}

export function sortCourses(rows: CourseRow[], key: SortKey): CourseRow[] {
  const out = [...rows];
  switch (key) {
    case "grade":
      // The average itself, highest first: the number the letter is read from,
      // so the letters and the GPAs printed under them both descend. Thin
      // histories used to be pulled toward 3.2 for sorting only, which put a
      // one-term A (CHEM 163, 3.95) below a run of B+s — the letters read out
      // of order. The amber dot on a thin badge carries that caution instead.
      // Equal averages go to the one with more terms behind it.
      return out.sort((a, b) => gradeKey(b) - gradeKey(a) || b.r - a.r || byCode(a, b));
    case "rating":
      // Then by how many ratings stand behind the score, then by grades.
      return out.sort((a, b) =>
        ratingKey(b) - ratingKey(a) || (b.pn ?? 0) - (a.pn ?? 0) || gradeKey(b) - gradeKey(a) || byCode(a, b));
    case "code":
    default:
      return out.sort(byCode);
  }
}

/** 0 = lower division, 1 = upper division, 2 = graduate. */
export function levelBand(c: CourseRow): number {
  const n = parseInt(c.c, 10) || 0;
  if (n >= 200) return 2;
  if (n >= 100) return 1;
  return 0;
}

/**
 * Whether the dataset actually knows this course's prerequisites. The catalog
 * and this term's schedule both record them; a course in neither is retired or
 * renumbered, and `pr: 0` there means "no record", not "no prerequisite".
 */
export const prereqKnown = (c: CourseRow) => c.ct !== 0 || c.o === 1;

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

/**
 * The professor a name on a page belongs to: their own archive name first,
 * then a spelling they are also known by — a course page says "Joe Politz",
 * the archive "Joseph Gibbs Politz". Null when nobody on file answers to it,
 * so a page can show the name without a link rather than a link to nothing.
 */
export function professorFor(profs: ProfessorRecord[], name: string): ProfessorRecord | null {
  const n = name.trim();
  if (!n) return null;
  return profs.find((p) => p.n === n) ?? profs.find((p) => p.a?.includes(n)) ?? null;
}

/**
 * A professor page's record from its URL: the page's own slug, or — for a
 * link built from a spelling on someone's schedule — a slug of one of their
 * other names. Their own name wins when both answer.
 */
export function professorBySlug(profs: ProfessorRecord[], slug: string): ProfessorRecord | null {
  return profs.find((p) => professorSlug(p.n) === slug)
    ?? profs.find((p) => p.a?.some((a) => professorSlug(a) === slug))
    ?? null;
}

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

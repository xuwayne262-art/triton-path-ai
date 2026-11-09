/**
 * Academic History terms: one conversion for the importer, the planner and
 * the suggestions.
 *
 * TSS (Triton Student System, UCSD's student system since Fall 2026) heads
 * each quarter with its academic year: "2026/2027 Fall Quarter" is Fall 2026,
 * while "2026/2027 Winter Quarter", "Spring Quarter" and the summer sessions
 * after them fall in 2027. Reading the first year for every season once put
 * Winter a whole year early.
 *
 * Summer Session 1, Summer Session 2 and the Special Session stay apart: they
 * are different terms with different dates, and a course can be taken in two
 * of them.
 *
 * Codes match the dataset's: "FA26", "WI27", "S126", "S226", plus "SS26" for
 * a Special Session and "SU26" only when the source says "Summer" and nothing
 * more.
 */

import { QUARTERS } from "@/lib/housing/terms";

const SEASONS = ["FA", "WI", "SP", "S1", "S2", "S3", "SU", "SS"] as const;
export type Season = (typeof SEASONS)[number];

/** Chronological order inside a calendar year. */
const ORDER: Record<Season, number> = { WI: 0, SP: 1, S1: 2, SU: 3, SS: 4, S2: 5, S3: 6, FA: 7 };

const TERM = /^(FA|WI|SP|S1|S2|S3|SU|SS)(\d{2})$/;

export const isTermCode = (code: unknown): code is string => typeof code === "string" && TERM.test(code);

/** The season and calendar year of a code, or null. */
export function splitTerm(code: string): { season: Season; year: number } | null {
  const m = TERM.exec(String(code ?? ""));
  return m ? { season: m[1] as Season, year: 2000 + Number(m[2]) } : null;
}

/** "FA26" -> 2026*10+7; anything unrecognised sorts last. */
export function termOrder(code: string): number {
  const t = splitTerm(code);
  return t ? t.year * 10 + ORDER[t.season] : Number.MAX_SAFE_INTEGER;
}

export const byTerm = (a: string, b: string) => termOrder(a) - termOrder(b);

/**
 * The academic year a term belongs to, by its first calendar year: Fall
 * 2026, Winter and Spring 2027 and the summer of 2027 are all 2026. TSS
 * writes the same thing as "2026/2027".
 */
export function academicYearOf(code: string): number | null {
  const t = splitTerm(code);
  if (!t) return null;
  return t.season === "FA" ? t.year : t.year - 1;
}

const SEASON_NAME: Record<Season, string> = {
  FA: "Fall", WI: "Winter", SP: "Spring",
  S1: "Summer Session I", S2: "Summer Session II", S3: "Summer Session III",
  SU: "Summer", SS: "Special Session",
};

/** "FA26" -> "Fall 2026", "S226" -> "Summer Session II 2026" (the site's own names). */
export function historyTermName(code: string): string {
  const t = splitTerm(code);
  return t ? `${SEASON_NAME[t.season]} ${t.year}` : code;
}

export const isSummer = (code: string) => /^(S1|S2|S3|SU|SS)\d{2}$/.test(code);

const ROMAN: Record<string, string> = { "1": "1", "2": "2", "3": "3", I: "1", II: "2", III: "3" };

/**
 * A TSS quarter heading as a term code: "2026/2027 Fall Quarter" -> "FA26",
 * "2025/2026 Summer Session 2" -> "S226". Null for anything else, including a
 * pair of years that are not consecutive.
 */
export function termFromTssHeading(text: string): string | null {
  const m =
    /^(\d{4})\s*[/–-]\s*(\d{4})\s+(fall|winter|spring)(?:\s+quarter)?$|^(\d{4})\s*[/–-]\s*(\d{4})\s+summer\s+session\s+(1|2|3|i{1,3})$|^(\d{4})\s*[/–-]\s*(\d{4})\s+(?:summer\s+)?special\s+session$/i
      .exec(String(text ?? "").replace(/\s+/g, " ").trim().replace(/\s*\(\d+\)$/, ""));
  if (!m) return null;
  const first = Number(m[1] ?? m[4] ?? m[7]);
  const second = Number(m[2] ?? m[5] ?? m[8]);
  if (second !== first + 1) return null;
  const yy = (y: number) => String(y).slice(2);
  if (m[3]) {
    const season = m[3].toLowerCase();
    if (season === "fall") return `FA${yy(first)}`;
    return `${season === "winter" ? "WI" : "SP"}${yy(second)}`;
  }
  if (m[6]) return `S${ROMAN[m[6].toUpperCase()]}${yy(second)}`;
  return `SS${yy(second)}`;
}

/** Whether a line is a TSS quarter heading. */
export const isTssHeading = (text: string) => termFromTssHeading(text) !== null;

/**
 * A term code from a name a student typed or picked: "Fall 2025",
 * "Summer Session 2 2026", "Special Session 2026". For the manual add form.
 */
export function termFromName(season: string, year: number): string | null {
  if (!Number.isInteger(year) || year < 1960 || year > 2099) return null;
  const s = season.trim().toUpperCase();
  return (SEASONS as readonly string[]).includes(s) ? `${s}${String(year).slice(2)}` : null;
}

export interface TermWindow {
  start: string;
  end: string;
  /** "registrar": the Registrar's calendar; "printed": the paste's own dates; "estimate": typical dates. */
  basis: "registrar" | "printed" | "estimate";
}

/** Typical first and last days, month and day, for terms the Registrar's list in this repo does not carry. */
const TYPICAL: Record<Season, [string, string]> = {
  FA: ["09-20", "12-15"],
  WI: ["01-03", "03-25"],
  SP: ["03-25", "06-15"],
  S1: ["06-25", "08-02"],
  S2: ["08-01", "09-08"],
  S3: ["06-25", "09-10"],
  SU: ["06-20", "09-10"],
  SS: ["06-20", "09-10"],
};

/**
 * When a term runs. The paste's own printed dates win, then the Registrar's
 * calendar, then typical dates (said to be an estimate).
 */
export function termWindow(code: string, printed?: { start?: string; end?: string } | null): TermWindow | null {
  if (printed?.start && printed?.end) return { start: printed.start, end: printed.end, basis: "printed" };
  const t = splitTerm(code);
  if (!t) return null;
  const known = QUARTERS.find((q) => q.key === code);
  if (known) return { start: known.begins, end: known.end, basis: "registrar" };
  const [from, to] = TYPICAL[t.season];
  return { start: `${t.year}-${from}`, end: `${t.year}-${to}`, basis: "estimate" };
}

/** Whether a term has ended by `today` (YYYY-MM-DD, San Diego). Unknown terms count as not ended. */
export function termEnded(code: string, today: string, printed?: { start?: string; end?: string } | null): boolean {
  const w = termWindow(code, printed);
  return w ? today > w.end : false;
}

/** Whether a term has begun by `today`. */
export function termStarted(code: string, today: string, printed?: { start?: string; end?: string } | null): boolean {
  const w = termWindow(code, printed);
  return w ? today >= w.start : false;
}

/** "09/21/2026" -> "2026-09-21", or null. */
export function usDate(text: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === iso ? iso : null;
}

/** "09/21/2026 - 12/12/2026" -> both ends, or null. */
export function dateRange(text: string): { start: string; end: string } | null {
  const m = /^(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})$/.exec(text.trim());
  if (!m) return null;
  const start = usDate(m[1]);
  const end = usDate(m[2]);
  return start && end && start <= end ? { start, end } : null;
}

const DAY = 86_400_000;

/**
 * Whether printed dates fit the heading's term: they must overlap its usual
 * window give or take six weeks. A mismatch is reported, never used to move
 * the course to another term.
 */
export function datesFitTerm(code: string, range: { start: string; end: string }): boolean {
  const w = termWindow(code);
  if (!w) return false;
  const slack = 42 * DAY;
  const s = Date.parse(`${range.start}T00:00:00Z`);
  const e = Date.parse(`${range.end}T00:00:00Z`);
  const ws = Date.parse(`${w.start}T00:00:00Z`) - slack;
  const we = Date.parse(`${w.end}T00:00:00Z`) + slack;
  return s >= ws && e <= we;
}

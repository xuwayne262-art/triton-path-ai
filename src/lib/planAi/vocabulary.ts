import type { DayOfWeek } from "@/components/triton/types";

/**
 * Campus vocabulary for Plan with AI: how students write course codes,
 * colleges, requirements, days and times, read the same way every time.
 *
 * Everything a student types is normalised here before anything else looks at
 * it — "cse11", "CSE-11" and "cse 11" are one course, "pofc" is Warren's
 * Programs of Concentration and never a word to find in a title, "10" in "no
 * classes before 10" is 10 a.m. — so neither the local parser nor the model
 * ever matches on spelling.
 */

// ── Course codes ─────────────────────────────────────────────────────────────

/** A code anywhere in text: a subject, an optional space or hyphen, a number, optional letters. */
const CODE_IN_TEXT = /\b([a-z]{2,5})[\s-]?(\d{1,3})\s?([a-z]{0,3})\b/gi;
/** A bare number joined to the code before it: "CSE 11 and 12", "MATH 20A, 20B". */
const MORE_IN_TEXT = /^\s*(?:,|\/|&|\band\b|\bor\b|,\s*and\b|,\s*or\b)\s*(\d{1,3})\s?([a-z]{0,3})\b(?!\s*(?:units?|am|pm|a\.m\.|p\.m\.|:\d))/i;

/** "cse 11" -> "CSE 11"; the dataset's spelling. */
export function canonicalCode(subject: string, number: string, suffix = ""): string {
  return `${subject.toUpperCase()} ${number.replace(/^0+(?=\d)/, "")}${suffix.toUpperCase()}`;
}

export interface CodeMatch {
  /** "CSE 11" */
  code: string;
  /** Whether the dataset has it. */
  known: boolean;
  start: number;
  end: number;
}

/**
 * Every course code in a piece of text, normalised. A word counts as a
 * subject only if the dataset has that subject, so "at 10" and "before 9"
 * are never courses. A code whose letters end in the number's own letters is
 * read both ways — "20a" is MATH 20A — and the one the catalog has wins.
 */
export function findCourseCodes(text: string, subjects: ReadonlySet<string>, codes: ReadonlySet<string>): CodeMatch[] {
  const out: CodeMatch[] = [];
  for (const m of text.matchAll(CODE_IN_TEXT)) {
    const subject = m[1].toUpperCase();
    if (!subjects.has(subject)) continue;
    const start = m.index ?? 0;
    let code = canonicalCode(subject, m[2], m[3]);
    let end = start + m[0].length;
    // "cse 11 is" and "math 20 and" read the next word as letters of the
    // number; they stay only when that makes a course the catalog has.
    if (m[3] && !codes.has(code)) {
      code = canonicalCode(subject, m[2]);
      end = start + m[0].length - m[3].length;
    }
    out.push({ code, known: codes.has(code), start, end });
    let rest = text.slice(end);
    for (let more = MORE_IN_TEXT.exec(rest); more; more = MORE_IN_TEXT.exec(rest)) {
      const plain = canonicalCode(subject, more[1]);
      const lettered = canonicalCode(subject, more[1], more[2]);
      const chosen = more[2] && codes.has(lettered) ? lettered : plain;
      const len = chosen === lettered ? more[0].length : more[0].length - more[2].length;
      out.push({ code: chosen, known: codes.has(chosen), start: end, end: end + len });
      end += len;
      rest = text.slice(end);
    }
  }
  return out;
}

/** One code typed on its own — "cse11", "MATH 20a" — or null. */
export function normalizeCode(raw: string, subjects: ReadonlySet<string>, codes: ReadonlySet<string>): string | null {
  const hits = findCourseCodes(raw.trim(), subjects, codes);
  return hits.length === 1 && hits[0].start === 0 && hits[0].end >= raw.trim().length - 1 ? hits[0].code : null;
}

// ── Colleges ─────────────────────────────────────────────────────────────────

/** GE keys by the names students use, longest first so "eleanor roosevelt" beats "roosevelt". */
export const COLLEGE_ALIASES: [RegExp, string][] = [
  [/\b(?:earl\s+)?warren(?:\s+college)?\b|\bewc\b/i, "warren"],
  [/\brevelle(?:\s+college)?\b/i, "revelle"],
  [/\b(?:john\s+)?muir(?:\s+college)?\b/i, "muir"],
  [/\b(?:thurgood\s+)?marshall(?:\s+college)?\b|\btmc\b/i, "marshall"],
  [/\beleanor\s+roosevelt(?:\s+college)?\b|\broosevelt\s+college\b|\berc\b(?!\s*\d)/i, "erc"],
  [/\b(?:sixth|6th)(?:\s+college)?\b/i, "sixth"],
  [/\b(?:seventh|7th)(?:\s+college)?\b/i, "seventh"],
  [/\b(?:eighth|8th)(?:\s+college)?\b/i, "eighth"],
];

/** The planner's spelling of a college ("Warren", "ERC") from a GE key. */
export const PLANNER_COLLEGE: Record<string, string> = {
  revelle: "Revelle", muir: "Muir", marshall: "Marshall", warren: "Warren",
  erc: "ERC", sixth: "Sixth", seventh: "Seventh", eighth: "Eighth",
};

/** "Warren" (the planner's choice) -> "warren" (a GE key). */
export const collegeKey = (planner: string | null | undefined): string | null =>
  planner ? planner.toLowerCase() : null;

// ── Requirement words ────────────────────────────────────────────────────────

/**
 * Words that name a requirement rather than a topic. They must never become
 * a title keyword: "pofc" appears in no course title, and searching for it
 * found nothing — the bug that turned "warren social science pofc" into zero
 * courses.
 */
export const REQUIREMENT_WORDS = /\b(?:p\.?\s?o\.?\s?f\.?\s?c\.?s?|pofcs?|programs?\s+of\s+concentration|area\s+stud(?:y|ies)|g\.?e\.?s?|gen\s*eds?|general\s+education|breadth|dei|ahi|requirements?|reqs?|credit|units?|prereq\w*|pre-?requisites?)\b/i;

export const POFC = /\b(?:p\.?\s?o\.?\s?f\.?\s?c\.?s?|pofcs?|programs?\s+of\s+concentrations?)\b/i;
export const AREA_STUDY = /\barea\s+stud(?:y|ies)\b/i;
export const GE_WORD = /\b(?:g\.?e\.?s?|gen\s*eds?|general\s+education|breadth)\b/i;
export const DEI = /\b(?:dei|diversity,?\s+equity,?\s+(?:and|&)\s+inclusion)\b/i;
export const AHI = /\b(?:ahi|american\s+history\s+(?:and|&)\s+institutions)\b/i;

/** Warren's three disciplines (ucsdStructure's DISCIPLINES ids) by how students say them. */
export const DISCIPLINE_ALIASES: [RegExp, "humanities" | "social" | "science"][] = [
  [/\bsoc(?:ial)?\.?\s*sci(?:ence)?s?\b|\bsocsci\b/i, "social"],
  [/\bhumanities(?:\s+(?:and|&)\s+fine\s+arts)?\b|\bfine\s+arts\b/i, "humanities"],
  [/\b(?:natural|physical)\s+sci(?:ence)?s?\b|\bnat\.?\s*sci\b|\bstem\b|\bmath(?:ematics)?,?\s+(?:natural\s+)?sci\w*(?:\s*(?:and|&)\s*engineering)?\b/i, "science"],
];

// ── Days and times ───────────────────────────────────────────────────────────

export const WEEKDAYS: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const DAY_WORDS: [RegExp, DayOfWeek][] = [
  [/^mon(?:day)?s?$|^m$/i, "Mon"],
  [/^tue(?:s(?:day)?)?s?$|^tu$/i, "Tue"],
  [/^wed(?:nesday)?s?$|^w$/i, "Wed"],
  [/^thu(?:r(?:s(?:day)?)?)?s?$|^th$/i, "Thu"],
  [/^fri(?:day)?s?$|^f$/i, "Fri"],
];

/** "friday" / "Fri" / "fridays" -> "Fri". */
export function dayFromWord(word: string): DayOfWeek | null {
  for (const [re, day] of DAY_WORDS) if (re.test(word.trim())) return day;
  return null;
}

/** "MWF" / "TuTh" / "tth" -> the days, or null when it is not a pattern of day letters. */
export function daysFromPattern(word: string): DayOfWeek[] | null {
  const w = word.trim().toLowerCase();
  if (!/^(?:m|tu|t|w|th|r|f)+$/.test(w) || w.length < 2) return null;
  const out: DayOfWeek[] = [];
  let i = 0;
  while (i < w.length) {
    if (w.startsWith("th", i)) { out.push("Thu"); i += 2; continue; }
    if (w.startsWith("tu", i)) { out.push("Tue"); i += 2; continue; }
    const c = w[i];
    if (c === "m") out.push("Mon");
    else if (c === "t") out.push("Tue");
    else if (c === "w") out.push("Wed");
    else if (c === "r") out.push("Thu");
    else if (c === "f") out.push("Fri");
    i += 1;
  }
  return [...new Set(out)];
}

/**
 * A clock time a student typed, as minutes past midnight. A bare hour is read
 * the way students mean it: 7–11 is morning, 12 is noon, 1–6 is afternoon.
 * Null when it is not a time a class could start or end at.
 */
export function parseClock(raw: string): number | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (t === "noon" || t === "midday") return 12 * 60;
  const m = /^(\d{1,2})(?::(\d{2}))?(a\.?m\.?|p\.?m\.?|a|p)?$/.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (min > 59) return null;
  const mer = m[3]?.[0];
  if (mer) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (mer === "p" ? 12 : 0);
  } else if (h >= 1 && h <= 6) {
    h += 12;
  } else if (h > 23) {
    return null;
  }
  const total = h * 60 + min;
  return total >= 6 * 60 && total <= 23 * 60 ? total : null;
}

/** 600 -> "10:00 AM", 870 -> "2:30 PM". */
export function clockLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** "10 AM" for an hour on the dot, else "10:30 AM": the compact form for chips. */
export function shortClock(min: number): string {
  const label = clockLabel(min);
  return label.replace(":00 ", " ");
}

// ── Plain text ───────────────────────────────────────────────────────────────

/** Small numbers students spell out. */
export const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20,
};

export const ORDINALS: Record<string, number> = {
  first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3,
};

/** Curly quotes, dashes and doubled spaces flattened, so the patterns read one spelling. */
export function flatten(text: string): string {
  return text
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

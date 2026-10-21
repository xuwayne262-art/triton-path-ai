import { earnsUnits, type ParsedHistory } from "@/lib/history/parse";
import { prereqKnown, type CourseRow } from "@/lib/plat";
import { prereqSegments } from "@/lib/prereqs";
import type { Check } from "./types";

/**
 * Prerequisites, checked against the student's own saved Academic History —
 * in the browser, never sent anywhere.
 *
 * UCSD writes prerequisites as prose. Only the shapes that have one meaning
 * are evaluated: courses joined by "or", courses joined by "and", groups
 * separated by ";", each optionally with a minimum grade. "CSE 12 and CSE 20
 * or MATH 109" could be read two ways, so it is not read at all; anything
 * else in the sentence — standing, consent, a program — is a condition this
 * cannot check. Either way the answer is "not checked", never "eligible".
 * A course passed in the record satisfies its line; one in progress or
 * planned earlier only conditionally, until it is passed.
 */

export interface StudentRecord {
  /** Passed courses, with the letter grade when there is one. Transfer credit counts when the record names the UCSD course. */
  completed: Map<string, { grade: string | null; via: "ucsd" | "transfer" }>;
  /** Courses in progress now. */
  inProgress: Set<string>;
  /** Courses the plan puts before the quarter being planned. */
  plannedBefore: Set<string>;
  /** Whether a saved Academic History exists at all. */
  hasHistory: boolean;
}

/** What the saved record and the plan say a student has done, or will have by the quarter in question. */
export function studentRecord(history: ParsedHistory | null, plannedBefore: Iterable<string> = []): StudentRecord {
  const completed: StudentRecord["completed"] = new Map();
  const inProgress = new Set<string>();
  for (const term of history?.terms ?? []) {
    for (const c of term.courses) {
      if (earnsUnits(c.status)) completed.set(c.code, { grade: c.grade, via: "ucsd" });
      else if (c.status === "progress") inProgress.add(c.code);
    }
  }
  for (const t of history?.transfer ?? []) {
    for (const code of [t.code, ...t.equivalents]) {
      if (code && !completed.has(code)) completed.set(code, { grade: null, via: "transfer" });
    }
  }
  const planned = new Set([...plannedBefore].filter((c) => !completed.has(c)));
  return { completed, inProgress, plannedBefore: planned, hasHistory: Boolean(history) };
}

const GRADE_ORDER = ["F", "D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];

/** Whether a grade meets a minimum. P meets a minimum of C- or lower, as UCSD defines P. Null when it cannot be told. */
function meets(grade: string | null, minimum: string | null): boolean | null {
  if (!minimum) return true;
  const min = GRADE_ORDER.indexOf(minimum.toUpperCase());
  if (min < 0) return null;
  if (!grade) return null;
  const g = grade.toUpperCase();
  if (g === "P" || g === "S") return min <= GRADE_ORDER.indexOf("C-");
  const at = GRADE_ORDER.indexOf(g);
  return at < 0 ? null : at >= min;
}

/** An option within one requirement line: a course, with the lowest grade it needs. */
interface Option {
  code: string;
  minimum: string | null;
}

export interface ParsedPrereq {
  /** Every line must be met; a line is met by any one of its options. */
  lines: Option[][];
  /** "or consent of instructor" is a way in that this cannot check. */
  consent: boolean;
  /** Conditions in words — standing, a program, approval — none of which can be checked here. */
  conditions: string | null;
}

const CONSENT = /\b(?:or\s+)?(?:consent|permission|approval)\s+of\s+(?:the\s+)?(?:instructor|department|program)\b/gi;
const MIN_GRADE = /\(\s*minimum\s+grade\s+([A-DF][+-]?)\s*\)/gi;
const CONNECTOR = /^[\s,;/&-]*(?:(?:or|and)[\s,;/&-]*)*$/i;

/**
 * The prerequisite sentence as lines of options, or null when its shape
 * has more than one reading or holds words this cannot place.
 */
export function parsePrereq(text: string): ParsedPrereq | null {
  const sentences = text.replace(/\s+/g, " ").trim().split(/(?<=[a-z0-9)]\.)\s+(?=[A-Z])/);
  let main = sentences[0].replace(/\.\s*$/, "");
  const rest = sentences.slice(1).join(" ").trim();
  let consent = false;
  // "A, B, or consent of instructor": the "or" before consent makes the commas "or" too.
  let consentOr = false;
  main = main.replace(CONSENT, (m) => {
    consent = true;
    if (/^or\b/i.test(m.trim())) consentOr = true;
    return " ";
  });
  const lines: Option[][] = [];
  for (const clause of main.split(";")) {
    const minimums = new Map<number, string>();
    let stripped = "";
    let last = 0;
    for (const m of clause.matchAll(MIN_GRADE)) {
      stripped += clause.slice(last, m.index);
      minimums.set(stripped.length, m[1].toUpperCase());
      last = (m.index ?? 0) + m[0].length;
    }
    stripped += clause.slice(last);
    if (!stripped.trim()) continue;
    const segments = prereqSegments(stripped);
    const codes: Option[] = [];
    const joins: string[] = [];
    let at = 0;
    for (const seg of segments) {
      if (seg.code) {
        // A minimum grade written right after this code belongs to it.
        const end = at + seg.text.length;
        const minimum = [...minimums].find(([pos]) => pos >= end && pos <= end + 2)?.[1] ?? null;
        codes.push({ code: seg.code, minimum });
      } else {
        if (!CONNECTOR.test(seg.text)) return null;
        if (codes.length) joins.push(seg.text.toLowerCase());
      }
      at += seg.text.length;
    }
    if (!codes.length) return null;
    const between = joins.slice(0, codes.length - 1);
    const hasOr = between.some((j) => /\bor\b/.test(j));
    const hasAnd = between.some((j) => /\band\b|-/.test(j));
    if (hasOr && hasAnd) return null;
    // Commas alone could join either way; only "…, or consent" settles it.
    if (!hasOr && !hasAnd && codes.length > 1 && !consentOr) return null;
    if (hasOr || (!hasAnd && consentOr)) lines.push(codes);
    else for (const c of codes) lines.push([c]);
  }
  if (!lines.length && !consent) return null;
  return { lines, consent, conditions: rest || null };
}

const STATED_NONE = /^\s*none\.?\s*$/i;
/** Words that make a prerequisite a condition about the student rather than a course. */
const STANDING = /\b(?:standing|graduate|doctoral|students?\s+only|admission|enrolled|restricted|majors?|program|approval|audition|stamp|placement|exam|score)\b/i;

/**
 * The prerequisite checks for one course. Each says what it rests on: UCSD's
 * catalog for "none", the student's record for "met" or "missing", and
 * "unknown" whenever either is silent or unclear.
 */
export function checkPrerequisites(
  row: CourseRow,
  pre: string | null | undefined,
  restrictions: string | null | undefined,
  record: StudentRecord,
): Check[] {
  const checks: Check[] = [];
  const code = row.k;
  if (restrictions?.trim()) {
    checks.push({ status: "unknown", code: "RESTRICTED", basis: "official", course: code, detail: { text: restrictions.trim().slice(0, 240) } });
  }
  if (!pre || !pre.trim()) {
    checks.push(prereqKnown(row)
      ? { status: "pass", code: "PREREQ_NONE_LISTED", basis: "official", course: code }
      : { status: "unknown", code: "PREREQ_NOT_IN_CATALOG", basis: "official", course: code });
    return checks;
  }
  if (STATED_NONE.test(pre)) {
    checks.push({ status: "pass", code: "PREREQ_NONE_STATED", basis: "official", course: code });
    return checks;
  }
  const text = pre.trim().slice(0, 240);
  const parsed = parsePrereq(pre);
  if (!parsed || (!parsed.lines.length && !parsed.consent)) {
    checks.push({ status: "unknown", code: STANDING.test(pre) ? "RESTRICTED" : "PREREQ_UNREADABLE", basis: "official", course: code, detail: { text } });
    return checks;
  }
  if (parsed.conditions) {
    checks.push({ status: "unknown", code: "RESTRICTED", basis: "official", course: code, detail: { text: parsed.conditions.slice(0, 240) } });
  }
  if (!parsed.lines.length) {
    checks.push({ status: "unknown", code: "PREREQ_CONSENT", basis: "official", course: code, detail: { text } });
    return checks;
  }
  if (!record.hasHistory) {
    checks.push({ status: "unknown", code: "PREREQ_NO_RECORD", basis: "record", course: code, detail: { text } });
    return checks;
  }

  const missing: string[] = [];
  const conditional: string[] = [];
  const met: string[] = [];
  let unclearGrade = false;
  for (const line of parsed.lines) {
    const done = line.map((o) => ({ o, hit: record.completed.get(o.code) })).filter((x) => x.hit);
    const ok = done.find((x) => meets(x.hit!.grade, x.o.minimum) === true);
    if (ok) { met.push(ok.o.code); continue; }
    if (done.some((x) => meets(x.hit!.grade, x.o.minimum) === null)) { unclearGrade = true; continue; }
    const coming = line.find((o) => record.inProgress.has(o.code) || record.plannedBefore.has(o.code));
    if (coming) { conditional.push(coming.code); continue; }
    missing.push(line.map((o) => o.code).join(" or "));
  }
  if (missing.length) {
    checks.push(parsed.consent
      ? { status: "unknown", code: "PREREQ_CONSENT", basis: "record", course: code, detail: { missing: missing.join("; "), text } }
      : { status: "fail", code: "PREREQ_MISSING", basis: "record", course: code, detail: { missing: missing.join("; ") } });
  } else if (unclearGrade) {
    checks.push({ status: "unknown", code: "PREREQ_UNREADABLE", basis: "record", course: code, detail: { text } });
  } else if (conditional.length) {
    checks.push({ status: "unknown", code: "PREREQ_PLANNED", basis: "record", course: code, detail: { courses: conditional.join(", ") } });
  } else {
    checks.push({ status: "pass", code: "PREREQ_MET", basis: "record", course: code, detail: { courses: met.join(", ") } });
  }
  return checks;
}

/** The prerequisite check that decides, of a course's checks: the first one about prerequisites. */
export const prereqCheck = (checks: Check[]): Check | undefined =>
  checks.find((c) => c.code.startsWith("PREREQ_"));

/** True for "UCSD states or lists no prerequisites" — the only evidence "no prerequisites" may rest on. */
export const noPrereqConfirmed = (checks: Check[]) => {
  const c = prereqCheck(checks);
  return c?.code === "PREREQ_NONE_STATED" || c?.code === "PREREQ_NONE_LISTED";
};

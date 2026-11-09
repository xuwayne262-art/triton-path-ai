/**
 * An Academic History as attempts: one course in one term, with what it
 * counts for on a given day.
 *
 * Everything that counts courses (the review screen, the 4-year plan, degree
 * progress, prerequisites, suggestions) reads them from here, so they cannot
 * disagree. Three rules hold throughout:
 *
 *  - A blank grade is "in progress" only while its term runs. Once the term
 *    has ended it is "grade missing": not passed, not in progress.
 *  - Units earned, units in progress and units planned are kept apart. A
 *    projection never adds to what is earned.
 *  - A row that needs review counts toward nothing until it is fixed.
 */

import { POINTS, earnsUnits, gradeStatus, isGraded } from "./grades";
import { historyTermName, termEnded, termOrder } from "./terms";
import { attemptKey, type GradeStatus, type HistoryCourse, type HistoryTerm, type ParsedHistory } from "./types";
import { todayInSanDiego } from "@/lib/housing/terms";

export type Standing =
  /** Passed: a letter grade D- or better, P or S. Earns units. */
  | "completed"
  /** Under way: a blank grade in a term still running, or IP. */
  | "in-progress"
  /** Term over and no grade shown (or NR). Grades can post late; check TSS. */
  | "missing-grade"
  /** F, NP or U: taken, no credit. */
  | "no-credit"
  | "withdrawn"
  | "incomplete"
  /** Something on the row could not be read with confidence. */
  | "needs-review";

export interface Attempt {
  /** "FA26|ECON 110B" */
  key: string;
  term: string;
  termName: string;
  course: HistoryCourse;
  status: GradeStatus;
  standing: Standing;
  /** Taken in more than one quarter. Credit is counted once; UCSD's repeat rules are not checked here. */
  repeated: boolean;
}

/** The status of a row on `today`: a blank grade is judged against its term's dates. */
export function effectiveStatus(
  course: Pick<HistoryCourse, "grade">,
  term: Pick<HistoryTerm, "code" | "start" | "end">,
  today: string,
): GradeStatus {
  const grade = course.grade?.trim() ? course.grade.trim().toUpperCase() : null;
  const s = gradeStatus(grade);
  if (grade === null) return termEnded(term.code, today, term) ? "missing" : "progress";
  return s;
}

export function standingOf(status: GradeStatus, review: boolean): Standing {
  if (review || status === "other") return "needs-review";
  switch (status) {
    case "graded":
    case "pass": return "completed";
    case "progress": return "in-progress";
    case "missing": return "missing-grade";
    case "fail": return "no-credit";
    case "withdrawn": return "withdrawn";
    case "incomplete": return "incomplete";
  }
}

/** Every attempt in chronological order, judged on `today`. */
export function listAttempts(history: Pick<ParsedHistory, "terms"> | null, today = todayInSanDiego()): Attempt[] {
  const terms = [...(history?.terms ?? [])].sort((a, b) => termOrder(a.code) - termOrder(b.code));
  const seen = new Map<string, number>();
  for (const t of terms) for (const c of t.courses) seen.set(c.code, (seen.get(c.code) ?? 0) + 1);
  const out: Attempt[] = [];
  for (const t of terms) {
    for (const c of t.courses) {
      const status = effectiveStatus(c, t, today);
      out.push({
        key: attemptKey(t.code, c.code),
        term: t.code,
        termName: historyTermName(t.code),
        course: c,
        status,
        standing: standingOf(status, Boolean(c.review?.length)),
        repeated: (seen.get(c.code) ?? 0) > 1,
      });
    }
  }
  return out;
}

export interface HistoryTotals {
  /** Every attempt. */
  courses: number;
  /** Units passed, each course once (a repeat is not counted twice). */
  earnedUnits: number;
  /** Units under way now. Not earned. */
  currentUnits: number;
  completed: number;
  inProgress: number;
  missingGrade: number;
  /** No credit, withdrawn or incomplete. */
  noCredit: number;
  needsReview: number;
  transferUnits: number;
  /** Codes taken in more than one quarter. */
  repeated: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function historyTotals(history: Pick<ParsedHistory, "terms" | "transfer"> | null, today = todayInSanDiego()): HistoryTotals {
  const attempts = listAttempts(history, today);
  const earned = new Map<string, number>();
  let currentUnits = 0;
  const t: HistoryTotals = {
    courses: attempts.length, earnedUnits: 0, currentUnits: 0, completed: 0, inProgress: 0,
    missingGrade: 0, noCredit: 0, needsReview: 0, transferUnits: 0, repeated: [],
  };
  for (const a of attempts) {
    switch (a.standing) {
      case "completed":
        t.completed++;
        earned.set(a.course.code, Math.max(earned.get(a.course.code) ?? 0, a.course.units));
        break;
      case "in-progress":
        t.inProgress++;
        currentUnits += a.course.units;
        break;
      case "missing-grade": t.missingGrade++; break;
      case "needs-review": t.needsReview++; break;
      default: t.noCredit++;
    }
  }
  t.earnedUnits = round2([...earned.values()].reduce((n, u) => n + u, 0));
  t.currentUnits = round2(currentUnits);
  t.transferUnits = round2((history?.transfer ?? []).reduce((n, x) => n + (x.units || 0), 0));
  t.repeated = [...new Set(attempts.filter((a) => a.repeated).map((a) => a.course.code))];
  return t;
}


/**
 * The record's totals, from its rows: units passed (each course once), units
 * in progress, transfer units, and a GPA over letter grades. The GPA is left
 * out (null) whenever a course was taken twice or a row needs review, because
 * UCSD's repeat rules decide which grade counts and they are not modelled.
 */
export function computeTotals(h: Pick<ParsedHistory, "terms" | "transfer">, today = todayInSanDiego()): ParsedHistory["totals"] {
  const t = historyTotals(h, today);
  let qualityPoints = 0;
  let gpaUnits = 0;
  for (const term of h.terms) {
    for (const c of term.courses) {
      if (c.review?.length || !isGraded(c.grade)) continue;
      qualityPoints += (POINTS[(c.grade as string).toUpperCase()] ?? 0) * c.units;
      gpaUnits += c.units;
    }
  }
  const clean = !t.repeated.length && !t.needsReview;
  return {
    courses: t.courses,
    unitsEarned: t.earnedUnits,
    unitsInProgress: t.currentUnits,
    transferUnits: t.transferUnits,
    gpa: clean && gpaUnits > 0 ? round2(qualityPoints / gpaUnits) : null,
  };
}

/** Whether an attempt's units are earned on `today` (and it needs no review). */
export const countsAsEarned = (a: Attempt) => a.standing === "completed" && earnsUnits(a.status);

/**
 * The record with each row's status set as of `today`. The server stores
 * what the student saw, and the planner re-judges blank grades by date.
 */
export function withStatuses<T extends Pick<ParsedHistory, "terms">>(history: T, today = todayInSanDiego()): T {
  return {
    ...history,
    terms: history.terms.map((t) => ({
      ...t,
      courses: t.courses.map((c) => ({ ...c, status: effectiveStatus(c, t, today) })),
    })),
  };
}

/** Labels for each standing, for screens and screen readers alike. */
export const STANDING_LABEL: Record<Standing, string> = {
  "completed": "Completed",
  "in-progress": "In progress",
  "missing-grade": "Grade missing",
  "no-credit": "No credit",
  "withdrawn": "Withdrawn",
  "incomplete": "Incomplete",
  "needs-review": "Needs review",
};

import type { GradeStatus } from "./types";

/**
 * UCSD's grade marks and what each says about credit.
 *
 * A grade that earns units is not the same as a grade that satisfies a
 * requirement: a D earns units but misses most "minimum grade C-" rules, and
 * a P can be refused by a major. Those checks belong to the requirement or
 * prerequisite (planAi/eligibility.ts); this file only says what the mark is.
 */

/** Grade points per unit, for the letter grades that carry them. */
export const POINTS: Record<string, number> = {
  "A+": 4, A: 4, "A-": 3.7,
  "B+": 3.3, B: 3, "B-": 2.7,
  "C+": 2.3, C: 2, "C-": 1.7,
  "D+": 1.3, D: 1, "D-": 0.7,
  F: 0,
};

/**
 * Every mark this reads. Anything else in the grade column is kept as
 * printed, with status "other", and is never read as a pass.
 */
export const KNOWN_GRADES = new Set([
  ...Object.keys(POINTS),
  "P", "NP", "S", "U", "W", "I", "IP", "NR",
]);

/** A token in the grade column's shape: one to three capitals, maybe a + or -. */
export const GRADE_SHAPE = /^[A-Z]{1,3}[+-]?$/;

/** Grades that count toward GPA. P/NP, W and IP deliberately do not. */
export const isGraded = (grade: string | null): boolean =>
  grade != null && Object.prototype.hasOwnProperty.call(POINTS, grade.toUpperCase());

/**
 * The status a printed mark gives, with no date in play. A blank grade is
 * "progress" here; attempts.ts turns it into "missing" once its term is over.
 */
export function gradeStatus(grade: string | null): GradeStatus {
  if (!grade || !grade.trim()) return "progress";
  const g = grade.trim().toUpperCase();
  if (isGraded(g)) return g === "F" ? "fail" : "graded";
  if (g === "P" || g === "S") return "pass";
  if (g === "NP" || g === "U") return "fail";
  if (g === "W") return "withdrawn";
  if (g === "I") return "incomplete";
  if (g === "IP") return "progress";
  if (g === "NR") return "missing";
  return "other";
}

/** Units a course actually contributes to a degree. Degree progress counts the same courses. */
export const earnsUnits = (s: GradeStatus) => s === "graded" || s === "pass";

/** Grade points a letter grade should print for `units`, or null for marks that carry none. */
export function expectedPoints(grade: string | null, units: number): number | null {
  if (!grade) return null;
  const p = POINTS[grade.toUpperCase()];
  return p == null ? null : Math.round(p * units * 10000) / 10000;
}

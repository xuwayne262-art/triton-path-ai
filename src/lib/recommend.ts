/**
 * Which courses the home page may recommend, as a rule it can state in full.
 *
 * The shelf used to promise "real lecture courses" and showed PSYC 194A,
 * Honors Thesis I, under it: the rule asked only for 3+ units, 40+ seats and
 * three graded terms. A thesis, a capstone, a practicum or a college's own
 * writing sequence can clear all three, and none of them is a course most
 * students can simply choose. The index has no restriction field, so the rule
 * uses what it does have — subject, number and title — and the page prints
 * the rule rather than a claim the data cannot back.
 */

import { levelBand, type CourseRow } from "./plat";

/** Each college's own core sequence, open only to that college's students. */
export const COLLEGE_CORE = new Set(["CAT", "CCE", "DOC", "HUM", "MCWP", "MMW", "SYN", "WCWP"]);

/** UCSD's numbers for freshman and senior seminars and special studies, in every department. */
const SPECIAL_NUMBER = /^(87|90|9[5-9]|19[2-9])[A-Z]*$/;

/** Titles of courses that are not an ordinary choice: honors, theses, research and the like. */
const SPECIAL_TITLE =
  /\b(honors?|thesis|capstone|practicum|internship|independent study|directed (group )?study|special (studies|topics)|apprentice\w*|field ?work|research)\b/i;

export const SHELF_RULE =
  "Undergraduate courses on this term's schedule with 3+ units, room for 40+ students and 3+ graded terms. "
  + "Colleges' core sequences and honors, thesis, capstone, practicum, internship, research and special-studies courses are left out.";

/** Whether a course may stand on the "highest historical averages" shelf. */
export function shelfEligible(c: CourseRow): boolean {
  return c.o === 1
    && (c.sl ?? 0) >= 40
    && c.r >= 3
    && c.g != null && c.g > 0
    && parseFloat(c.u ?? "0") >= 3
    && levelBand(c) < 2
    && !COLLEGE_CORE.has(c.s)
    && !SPECIAL_NUMBER.test(c.c)
    && !SPECIAL_TITLE.test(c.t);
}

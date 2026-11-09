/**
 * Putting a new paste together with the Academic History already saved.
 *
 * TSS shows what it has loaded, so a paste can be a few quarters of a longer
 * record. Saving one used to replace the record whole, and a shorter paste
 * quietly deleted every quarter it left out. Now a paste merges by default:
 *
 *  - an attempt is a course in a term; the same attempt pasted again is
 *    updated in place (a grade posted since, a corrected unit count), never
 *    added twice;
 *  - a blank grade in the paste never erases a grade already saved;
 *  - quarters and courses the paste does not mention are kept;
 *  - the same paste merged twice changes nothing.
 *
 * Replacing is still possible, as a choice, and the diff names every course
 * it would remove before anything is saved.
 */

import { computeTotals } from "./attempts";
import { termOrder } from "./terms";
import { attemptKey, type HistoryCourse, type HistoryTerm, type ParsedHistory, type TransferCourse } from "./types";

export type MergeMode = "merge" | "replace";

export interface AttemptRef {
  term: string;
  code: string;
}

export interface AttemptChange extends AttemptRef {
  /** What changed, in words: "grade B+ (was blank)", "units 4 (was 2)". */
  changes: string[];
}

export interface MergeDiff {
  added: AttemptRef[];
  updated: AttemptChange[];
  /** Saved attempts the paste does not mention: kept when merging, removed when replacing. */
  untouched: AttemptRef[];
  /** Saved attempts the student chose to remove. */
  removed: AttemptRef[];
  unchanged: number;
  addedTerms: string[];
  transferAdded: number;
  transferRemoved: number;
}

const blankDiff = (): MergeDiff => ({
  added: [], updated: [], untouched: [], removed: [], unchanged: 0, addedTerms: [], transferAdded: 0, transferRemoved: 0,
});

const shown = (g: string | null) => g ?? "blank";

/** One saved attempt brought up to date by the same attempt in a paste. */
function reconcile(saved: HistoryCourse, next: HistoryCourse): { course: HistoryCourse; changes: string[] } {
  const out: HistoryCourse = { ...saved };
  const changes: string[] = [];
  if (next.grade != null && next.grade !== saved.grade) {
    changes.push(`grade ${next.grade} (was ${shown(saved.grade)})`);
    out.grade = next.grade;
    out.points = next.points;
    out.status = next.status;
  } else if (next.grade != null && next.points != null && saved.points == null) {
    out.points = next.points;
  }
  if (next.units > 0 && next.units !== saved.units) {
    changes.push(`units ${next.units} (was ${saved.units})`);
    out.units = next.units;
  }
  if (next.title && next.title !== saved.title) out.title = next.title;
  for (const k of ["src", "option", "cnv", "unmatched", "manual"] as const) {
    if (next[k] !== undefined) (out as unknown as Record<string, unknown>)[k] = next[k];
  }
  // The newer read decides what still needs review.
  if (next.review?.length) out.review = [...next.review];
  else delete out.review;
  if (next.grade == null && saved.grade == null) out.status = next.status;
  return { course: out, changes };
}

const transferKey = (t: TransferCourse) =>
  [t.from, t.title, t.units, t.code ?? "", t.equivalents.join(",")].join("|").toLowerCase();

function sortTerms(terms: HistoryTerm[]): HistoryTerm[] {
  return terms.sort((a, b) => termOrder(a.code) - termOrder(b.code));
}

/**
 * The record that saving would keep, and what it changes. `removed` lists
 * attempt keys ("FA26|CSE 11") the student chose to take out.
 */
export function mergeHistory(
  saved: ParsedHistory | null,
  incoming: ParsedHistory,
  mode: MergeMode = "merge",
  removed: Iterable<string> = [],
): { result: ParsedHistory; diff: MergeDiff } {
  const diff = blankDiff();
  const drop = new Set(removed);
  const base: HistoryTerm[] = mode === "replace" || !saved ? [] : saved.terms.map((t) => ({ ...t, courses: t.courses.map((c) => ({ ...c })) }));
  const byCode = new Map(base.map((t) => [t.code, t]));
  const savedKeys = new Set((saved?.terms ?? []).flatMap((t) => t.courses.map((c) => attemptKey(t.code, c.code))));
  const savedCourse = new Map((saved?.terms ?? []).flatMap((t) => t.courses.map((c) => [attemptKey(t.code, c.code), c] as const)));
  const mentioned = new Set<string>();

  for (const term of incoming.terms) {
    let target = byCode.get(term.code);
    if (!target) {
      target = { code: term.code, label: term.label, courses: [] };
      if (term.start) target.start = term.start;
      if (term.end) target.end = term.end;
      byCode.set(term.code, target);
      base.push(target);
      if (!(saved?.terms ?? []).some((t) => t.code === term.code)) diff.addedTerms.push(term.code);
    } else if (term.start && term.end) {
      target.start = term.start;
      target.end = term.end;
    }
    for (const c of term.courses) {
      const key = attemptKey(term.code, c.code);
      mentioned.add(key);
      const prior = savedCourse.get(key);
      const at = target.courses.findIndex((x) => x.code === c.code);
      if (prior) {
        const { course, changes } = reconcile(prior, c);
        if (at >= 0) target.courses[at] = course;
        else target.courses.push(course);
        if (changes.length) diff.updated.push({ term: term.code, code: c.code, changes });
        else diff.unchanged++;
      } else if (at >= 0) {
        // Twice in the paste itself: the parser folds those, but a hand edit can add one.
        target.courses[at] = reconcile(target.courses[at], c).course;
      } else {
        target.courses.push({ ...c });
        diff.added.push({ term: term.code, code: c.code });
      }
    }
  }

  for (const key of savedKeys) {
    if (mentioned.has(key) || drop.has(key)) continue;
    const [term, code] = key.split("|");
    diff.untouched.push({ term, code });
  }

  // The student's own removals, from whatever the record now holds.
  const terms = sortTerms(base
    .map((t) => ({
      ...t,
      courses: t.courses.filter((c) => {
        const key = attemptKey(t.code, c.code);
        if (!drop.has(key)) return true;
        if (savedKeys.has(key)) diff.removed.push({ term: t.code, code: c.code });
        return false;
      }),
    }))
    .filter((t) => t.courses.length));

  // Transfer credit: TSS pastes carry none, so replacing UCSD quarters never
  // wipes transfer rows unless the paste brought its own.
  const savedTransfer = saved?.transfer ?? [];
  let transfer: TransferCourse[];
  if (mode === "replace" && incoming.transfer.length) {
    transfer = incoming.transfer.map((t) => ({ ...t, equivalents: [...t.equivalents] }));
    const next = new Set(transfer.map(transferKey));
    diff.transferRemoved = savedTransfer.filter((t) => !next.has(transferKey(t))).length;
    diff.transferAdded = transfer.filter((t) => !savedTransfer.some((s) => transferKey(s) === transferKey(t))).length;
  } else {
    const have = new Set(savedTransfer.map(transferKey));
    const extra = incoming.transfer.filter((t) => !have.has(transferKey(t)));
    diff.transferAdded = extra.length;
    transfer = [...savedTransfer, ...extra].map((t) => ({ ...t, equivalents: [...t.equivalents] }));
  }

  const result: ParsedHistory = {
    college: incoming.college ?? saved?.college ?? null,
    majors: incoming.majors.length ? [...incoming.majors] : [...(saved?.majors ?? [])],
    minors: incoming.minors.length ? [...incoming.minors] : [...(saved?.minors ?? [])],
    terms,
    transfer,
    warnings: [],
    totals: { courses: 0, unitsEarned: 0, unitsInProgress: 0, transferUnits: 0, gpa: null },
    ...(incoming.source ? { source: incoming.source } : saved?.source ? { source: saved.source } : {}),
    ...(incoming.planStart ?? saved?.planStart ? { planStart: incoming.planStart ?? saved?.planStart } : {}),
  };
  result.totals = { ...computeTotals(result), gpa: null };
  return { result, diff };
}

/** Whether saving would change anything at all. In replace mode, untouched attempts are removals. */
export const changesSomething = (d: MergeDiff, mode: MergeMode = "merge") =>
  d.added.length + d.updated.length + d.removed.length + d.transferAdded + d.transferRemoved
    + (mode === "replace" ? d.untouched.length : 0) > 0;

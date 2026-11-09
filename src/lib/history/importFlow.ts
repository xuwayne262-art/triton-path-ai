/**
 * The Academic History review, as plain data: what the import page holds
 * between a paste and a save, and every change a student can make to it.
 *
 * A paste never touches the saved record. It is read into a draft, merged
 * with the saved copy only for the preview, and saved only when the student
 * presses Save. The pasted text itself is never kept: each paste is read and
 * dropped, and only the courses it held stay in the draft.
 */

import { effectiveStatus, historyTotals, type HistoryTotals } from "./attempts";
import { resolveCode, splitCode } from "./codes";
import { KNOWN_GRADES, expectedPoints, gradeStatus } from "./grades";
import { changesSomething, mergeHistory, type MergeDiff, type MergeMode } from "./merge";
import { readAcademicHistory, type ReadOptions, type ReadReport } from "./parse";
import { historyTermName, isTermCode, termOrder } from "./terms";
import type { ReadMessage } from "./tss";
import { attemptKey, type HistoryCourse, type HistoryTerm, type ParsedHistory, type TransferCourse } from "./types";

export interface Draft {
  /** Courses read from pastes and entered by hand, with the student's edits. */
  incoming: ParsedHistory;
  /** Rows a paste printed under no quarter, waiting for the student to place them. */
  unplaced: HistoryCourse[];
  /** Saved attempts ("FA26|CSE 11") the student chose to remove. */
  removed: string[];
  mode: MergeMode;
  /** The latest paste's report. */
  report: ReadReport | null;
  /** The quarter offered for unplaced rows, when one is under way. */
  suggestedTerm: string | null;
  /** Lines the old TritonLink reader could not read. Shown here, never saved. */
  lines: string[];
}

export const emptyHistory = (): ParsedHistory => ({
  college: null, majors: [], minors: [], terms: [], transfer: [], warnings: [],
  totals: { courses: 0, unitsEarned: 0, unitsInProgress: 0, transferUnits: 0, gpa: null },
});

export const emptyDraft = (): Draft => ({
  incoming: emptyHistory(), unplaced: [], removed: [], mode: "merge", report: null, suggestedTerm: null, lines: [],
});

/** Whether the draft holds anything to review. */
export const hasDraft = (d: Draft) =>
  d.incoming.terms.length > 0 || d.incoming.transfer.length > 0 || d.unplaced.length > 0 || d.removed.length > 0
  || d.incoming.planStart !== undefined;

/**
 * Reads one paste into the draft. A paste with no courses changes nothing
 * and says why. Pasting the same quarters twice changes nothing either.
 */
export function addPaste(draft: Draft, text: string, opts: ReadOptions): { draft: Draft; report: ReadReport; added: number } {
  const read = readAcademicHistory(text, opts);
  const rows = read.report.rows;
  if (!rows && !read.history.transfer.length) return { draft: { ...draft, report: read.report }, report: read.report, added: 0 };
  const { result } = mergeHistory(draft.incoming, read.history);
  const unplaced = [...draft.unplaced];
  for (const c of read.unplaced) {
    if (!unplaced.some((u) => u.code === c.code && u.grade === c.grade)) unplaced.push(c);
  }
  return {
    draft: {
      ...draft,
      incoming: { ...result, source: read.history.source ?? result.source },
      unplaced,
      report: read.report,
      suggestedTerm: read.report.suggestedTerm ?? draft.suggestedTerm,
      lines: [...draft.lines, ...read.history.warnings].slice(0, 40),
    },
    report: read.report,
    added: rows,
  };
}

/** The course in the draft, or else in the saved copy, for a term and code. */
function findCourse(draft: Draft, saved: ParsedHistory | null, term: string, code: string): HistoryCourse | null {
  const inDraft = draft.incoming.terms.find((t) => t.code === term)?.courses.find((c) => c.code === code);
  if (inDraft) return inDraft;
  return saved?.terms.find((t) => t.code === term)?.courses.find((c) => c.code === code) ?? null;
}

function termOf(draft: Draft, saved: ParsedHistory | null, term: string): Pick<HistoryTerm, "code" | "start" | "end" | "label"> {
  return draft.incoming.terms.find((t) => t.code === term)
    ?? saved?.terms.find((t) => t.code === term)
    ?? { code: term, label: historyTermName(term) };
}

/** Puts a course into the draft's term, replacing the same attempt if it is there. */
function upsert(draft: Draft, term: Pick<HistoryTerm, "code" | "start" | "end" | "label">, course: HistoryCourse): Draft {
  const terms = draft.incoming.terms.map((t) => ({ ...t, courses: [...t.courses] }));
  let t = terms.find((x) => x.code === term.code);
  if (!t) {
    t = { code: term.code, label: term.label, courses: [], ...(term.start && term.end ? { start: term.start, end: term.end } : {}) };
    terms.push(t);
  }
  const at = t.courses.findIndex((c) => c.code === course.code);
  if (at >= 0) t.courses[at] = course;
  else t.courses.push(course);
  terms.sort((a, b) => termOrder(a.code) - termOrder(b.code));
  return {
    ...draft,
    incoming: { ...draft.incoming, terms },
    removed: draft.removed.filter((k) => k !== attemptKey(term.code, course.code)),
  };
}

/** A grade as the student typed it: one UCSD knows, or blank. Null when it is neither. */
export function cleanGrade(input: string): { ok: true; grade: string | null } | { ok: false } {
  const g = input.trim().toUpperCase();
  if (!g) return { ok: true, grade: null };
  return KNOWN_GRADES.has(g) ? { ok: true, grade: g } : { ok: false };
}

export interface CourseEdit {
  grade?: string | null;
  units?: number;
}

/**
 * Corrects one row. The row's review flags that the edit answers are
 * cleared; the printed grade points go when the grade changes, since they
 * belonged to the old grade.
 */
export function editCourse(
  draft: Draft, saved: ParsedHistory | null, term: string, code: string, edit: CourseEdit, today: string,
): Draft {
  const prior = findCourse(draft, saved, term, code);
  if (!prior) return draft;
  const t = termOf(draft, saved, term);
  const next: HistoryCourse = { ...prior, manual: true };
  let review = new Set(prior.review ?? []);
  if (edit.grade !== undefined && edit.grade !== prior.grade) {
    next.grade = edit.grade;
    next.points = null;
    review.delete("unknown-grade");
    review.delete("points-mismatch");
    review.delete("conflicting-copies");
  }
  if (edit.units !== undefined && Number.isFinite(edit.units) && edit.units > 0 && edit.units <= 30) {
    next.units = Math.round(edit.units * 100) / 100;
    review.delete("no-units");
    const expected = expectedPoints(next.grade, next.units);
    if (expected != null && next.points != null && Math.abs(expected - next.points) <= 0.05) review.delete("points-mismatch");
  }
  if (next.grade && !KNOWN_GRADES.has(next.grade)) review.add("unknown-grade");
  review = new Set([...review]);
  if (review.size) next.review = [...review];
  else delete next.review;
  next.status = effectiveStatus(next, t, today);
  return upsert(draft, t, next);
}

/** Takes a row out: from the draft if it came from a paste, and from the saved copy if it is there. */
export function removeCourse(draft: Draft, saved: ParsedHistory | null, term: string, code: string): Draft {
  const terms = draft.incoming.terms
    .map((t) => (t.code === term ? { ...t, courses: t.courses.filter((c) => c.code !== code) } : t))
    .filter((t) => t.courses.length);
  const key = attemptKey(term, code);
  const inSaved = Boolean(saved?.terms.find((t) => t.code === term)?.courses.some((c) => c.code === code));
  return {
    ...draft,
    incoming: { ...draft.incoming, terms },
    removed: inSaved && !draft.removed.includes(key) ? [...draft.removed, key] : draft.removed,
  };
}

/** Undoes a removal of a saved row. */
export function keepCourse(draft: Draft, term: string, code: string): Draft {
  const key = attemptKey(term, code);
  return { ...draft, removed: draft.removed.filter((k) => k !== key) };
}

/** Files a row the paste printed under no quarter into the quarter the student picked. */
export function placeCourse(draft: Draft, index: number, term: string, today: string): Draft {
  const course = draft.unplaced[index];
  if (!course || !isTermCode(term)) return draft;
  const review = (course.review ?? []).filter((r) => r !== "no-quarter");
  const placed: HistoryCourse = { ...course, manual: true, ...(review.length ? { review } : {}) };
  if (!review.length) delete placed.review;
  const t = { code: term, label: historyTermName(term) };
  placed.status = effectiveStatus(placed, t, today);
  const next = upsert(draft, t, placed);
  return { ...next, unplaced: draft.unplaced.filter((_, i) => i !== index) };
}

/** Drops a row the paste printed under no quarter. */
export const dropUnplaced = (draft: Draft, index: number): Draft =>
  ({ ...draft, unplaced: draft.unplaced.filter((_, i) => i !== index) });

export interface ManualCourse {
  term: string;
  code: string;
  title: string;
  units: string;
  grade: string;
}

/** A course the student types in, checked the way a pasted one is. Returns an error in words when it cannot be added. */
export function addManualCourse(
  draft: Draft, input: ManualCourse, today: string, has: ((code: string) => boolean) | null,
): { draft: Draft; error: string | null } {
  if (!isTermCode(input.term)) return { draft, error: "Choose the quarter you took it in." };
  const parts = splitCode(input.code.trim().toUpperCase());
  if (!parts) return { draft, error: "Enter the course code as TSS shows it, like ECON 110B or ECON-110B." };
  const units = Number.parseFloat(input.units);
  if (!Number.isFinite(units) || units <= 0 || units > 30) return { draft, error: "Enter the units, like 4." };
  const grade = cleanGrade(input.grade);
  if (!grade.ok) return { draft, error: "That grade isn't one UCSD uses. Leave it blank if none is shown." };
  const r = resolveCode(parts, has);
  const course: HistoryCourse = {
    code: r.code,
    subject: parts.subject,
    number: r.number,
    title: input.title.trim().slice(0, 120),
    units: Math.round(units * 100) / 100,
    grade: grade.grade,
    points: null,
    status: gradeStatus(grade.grade),
    manual: true,
    ...(has && !r.matched ? { unmatched: true } : {}),
  };
  const t = termOf(draft, null, input.term);
  course.status = effectiveStatus(course, t, today);
  return { draft: upsert(draft, t, course), error: null };
}

export interface ManualTransfer {
  from: string;
  title: string;
  units: string;
  equivalent: string;
}

/**
 * Transfer or test credit typed in by the student. A UCSD equivalent is kept
 * only when typed, as TSS's "Internal" column names it; none is ever guessed
 * from a title or a unit count.
 */
export function addManualTransfer(draft: Draft, input: ManualTransfer): { draft: Draft; error: string | null } {
  const from = input.from.trim().slice(0, 60);
  if (!from) return { draft, error: "Say where the credit came from, like AP or the college's name." };
  const units = Number.parseFloat(input.units);
  if (!Number.isFinite(units) || units <= 0 || units > 30) return { draft, error: "Enter the units, like 4." };
  const eq = input.equivalent.trim().toUpperCase();
  const parts = eq ? splitCode(eq) : null;
  if (eq && !parts && eq !== "XFERLD") return { draft, error: "Enter the UCSD course as TSS shows it (like MATH 20A), or leave it blank." };
  const row: TransferCourse = {
    code: parts ? `${parts.subject} ${parts.number}` : null,
    title: input.title.trim().slice(0, 120) || from,
    units: Math.round(units * 100) / 100,
    from,
    level: eq === "XFERLD" ? "LD" : null,
    equivalents: [],
    manual: true,
  };
  return { draft: { ...draft, incoming: { ...draft.incoming, transfer: [...draft.incoming.transfer, row] } }, error: null };
}

/** Sets which academic year is Year 1 of the 4-year plan, or clears it with null. */
export function setPlanStart(draft: Draft, planStart: number | null): Draft {
  const incoming = { ...draft.incoming };
  if (planStart == null) delete incoming.planStart;
  else incoming.planStart = planStart;
  return { ...draft, incoming };
}

export interface Preview {
  /** What saving would keep. */
  result: ParsedHistory;
  diff: MergeDiff;
  totals: HistoryTotals;
  /** Whether saving would change anything. */
  changes: boolean;
  /** Rows saved but counted toward nothing until fixed. */
  reviewRows: number;
}

/** The record as it would be saved, against the saved copy. */
export function previewDraft(saved: ParsedHistory | null, draft: Draft, today: string): Preview {
  const { result, diff } = mergeHistory(saved, draft.incoming, draft.mode, draft.removed);
  const totals = historyTotals(result, today);
  const planChanged = (draft.incoming.planStart ?? saved?.planStart) !== saved?.planStart;
  return {
    result,
    diff,
    totals,
    changes: changesSomething(diff, draft.mode) || planChanged || (!saved && result.terms.length + result.transfer.length > 0),
    reviewRows: result.terms.reduce((n, t) => n + t.courses.filter((c) => c.review?.length).length, 0),
  };
}

/**
 * The request body that saves the preview: the record (with nothing of the
 * paste's own text) and the saved copy's time, so a newer save elsewhere is
 * never overwritten.
 */
export function savePayload(saved: (ParsedHistory & { savedAt?: string }) | null, preview: Preview): { history: ParsedHistory; base: string | null } {
  return { history: { ...preview.result, warnings: [] }, base: saved?.savedAt ?? null };
}

/** The worst of a read's messages, for the line under the paste box. */
export const leadMessage = (r: ReadReport | null): ReadMessage | null => r?.messages[0] ?? null;

/**
 * The saved Academic History laid over the 4-year plan.
 *
 * The plan's twelve quarters carry no dates: Year 2 Winter is whatever the
 * student makes it. Placing a real Fall 2026 course needs one fact the plan
 * does not hold, which academic year is Year 1, and the student is asked for
 * it rather than having it guessed (`planStart`, kept with the history).
 * Until then every attempt is still shown, listed by its own quarter.
 *
 * The history is derived, never copied into the plan: deleting it takes
 * every chip and count it produced away and leaves the student's own plan
 * as it was. A planned course is never moved or deleted here. Where one is
 * the same attempt as a history row (same course, same quarter) it is shown
 * once, as history; where one is planned after the course was already
 * passed, it is flagged with a targeted way to remove it.
 */

import { listAttempts, STANDING_LABEL, type Attempt, type Standing } from "./attempts";
import { academicYearOf, historyTermName, isSummer, splitTerm, termEnded, termOrder } from "./terms";
import type { ParsedHistory } from "./types";
import type { PlanQuarter, PlanYear } from "@/lib/plan/record";

export interface HistoryChip {
  key: string;
  term: string;
  termName: string;
  code: string;
  /** The code as the record printed it, when it differs ("WCWP-010B"). */
  src?: string;
  title: string;
  units: number;
  grade: string | null;
  standing: Standing;
  label: string;
  repeated: boolean;
  unmatched: boolean;
  /** The planned entry this attempt stands for, when the plan had it in the same quarter. */
  plannedId?: string;
}

export interface PlannedLike {
  courseId: string;
  course: { code: string };
  year: PlanYear;
  quarter: PlanQuarter;
}

export interface Flag {
  courseId: string;
  code: string;
  year: PlanYear;
  quarter: PlanQuarter;
  kind:
    /** Planned for a quarter after the one the history shows it passed. */
    | "already-completed"
    /** Planned for a quarter that has ended, with no attempt in the history for it. */
    | "past-not-taken";
  /** "Summer Session II 2026": where the history has it, for already-completed. */
  doneIn?: string;
}

export interface PlanLayer {
  /** Whether the student has said which year of the plan is which. */
  anchored: boolean;
  /** Attempts by plan slot, "2-Winter". */
  bySlot: Map<string, HistoryChip[]>;
  /** Summer attempts by plan year, shown after that year's Spring. */
  summer: Map<PlanYear, HistoryChip[]>;
  /** Attempts the grid cannot hold: before Year 1, after Year 4, or every attempt while unanchored. */
  outside: Array<{ term: string; termName: string; chips: HistoryChip[] }>;
  /** Planned entries shown as history instead, because they are the same attempt. */
  matched: Set<string>;
  flags: Flag[];
}

export const slotKey = (year: PlanYear, quarter: PlanQuarter) => `${year}-${quarter}`;

const SEASON_OF: Record<string, PlanQuarter> = { FA: "Fall", WI: "Winter", SP: "Spring" };

/** The plan year a term falls in, given the calendar year whose fall is Year 1. Not clamped. */
export function planYearOf(term: string, planStart: number): number | null {
  const ay = academicYearOf(term);
  return ay == null ? null : ay - planStart + 1;
}

/** The calendar term a plan slot stands for: Year 2 Winter with Year 1 = 2025 is "WI27". */
export function termForSlot(year: PlanYear, quarter: PlanQuarter, planStart: number): string {
  const ay = planStart + year - 1;
  const yy = (n: number) => String(n).slice(2);
  return quarter === "Fall" ? `FA${yy(ay)}` : `${quarter === "Winter" ? "WI" : "SP"}${yy(ay + 1)}`;
}

/** "2026–27": the academic year a plan year stands for. */
export function academicYearLabel(year: PlanYear, planStart: number): string {
  const ay = planStart + year - 1;
  return `${ay}–${String(ay + 1).slice(2)}`;
}

/**
 * The academic year a student is in on `today` (YYYY-MM-DD), by its first
 * calendar year: the regular quarter under way or next to start. From July
 * on, that is the coming fall's year.
 */
export function currentAcademicYear(today: string): number {
  const [y, m] = today.split("-").map(Number);
  return m >= 7 ? y : y - 1;
}

/** `planStart` for "this academic year is Year N". */
export const planStartFor = (year: number, academicYear: number) => academicYear - year + 1;

/** Which plan year the academic year under way is, for a given planStart. */
export const planYearNow = (planStart: number, today: string) => currentAcademicYear(today) - planStart + 1;

function chipOf(a: Attempt): HistoryChip {
  return {
    key: a.key,
    term: a.term,
    termName: a.termName,
    code: a.course.code,
    ...(a.course.src && a.course.src.replace("-", " ") !== a.course.code ? { src: a.course.src } : {}),
    title: a.course.title,
    units: a.course.units,
    grade: a.course.grade,
    standing: a.standing,
    label: STANDING_LABEL[a.standing],
    repeated: a.repeated,
    unmatched: Boolean(a.course.unmatched),
  };
}

export function buildPlanLayer(
  history: Pick<ParsedHistory, "terms" | "planStart"> | null,
  planned: PlannedLike[],
  today: string,
): PlanLayer {
  const attempts = listAttempts(history, today);
  const planStart = history?.planStart ?? null;
  const layer: PlanLayer = {
    anchored: planStart != null,
    bySlot: new Map(),
    summer: new Map(),
    outside: [],
    matched: new Set(),
    flags: [],
  };
  const outside = new Map<string, HistoryChip[]>();
  const put = (m: Map<string, HistoryChip[]>, key: string, chip: HistoryChip) => {
    const list = m.get(key) ?? [];
    list.push(chip);
    m.set(key, list);
  };

  for (const a of attempts) {
    const chip = chipOf(a);
    const year = planStart == null ? null : planYearOf(a.term, planStart);
    const season = splitTerm(a.term)?.season;
    if (year == null || year < 1 || year > 4 || !season) {
      put(outside, a.term, chip);
      continue;
    }
    if (isSummer(a.term)) {
      const list = layer.summer.get(year as PlanYear) ?? [];
      list.push(chip);
      layer.summer.set(year as PlanYear, list);
      continue;
    }
    const quarter = SEASON_OF[season];
    put(layer.bySlot, slotKey(year as PlanYear, quarter), chip);
  }

  layer.outside = [...outside.entries()]
    .sort((a, b) => termOrder(a[0]) - termOrder(b[0]))
    .map(([term, chips]) => ({ term, termName: historyTermName(term), chips }));

  if (planStart != null) {
    const passed = new Map<string, Attempt>();
    for (const a of attempts) if (a.standing === "completed" && !passed.has(a.course.code)) passed.set(a.course.code, a);
    const terms = new Set(attempts.map((a) => a.term));
    for (const p of planned) {
      const term = termForSlot(p.year, p.quarter, planStart);
      const same = layer.bySlot.get(slotKey(p.year, p.quarter))?.find((c) => c.code === p.course.code && !c.plannedId);
      if (same) {
        same.plannedId = p.courseId;
        layer.matched.add(p.courseId);
        continue;
      }
      const done = passed.get(p.course.code);
      if (done && termOrder(done.term) < termOrder(term)) {
        layer.flags.push({ courseId: p.courseId, code: p.course.code, year: p.year, quarter: p.quarter, kind: "already-completed", doneIn: done.termName });
        continue;
      }
      // A quarter that is over and that the history covers, without this course in it.
      if (termEnded(term, today) && terms.has(term)) {
        layer.flags.push({ courseId: p.courseId, code: p.course.code, year: p.year, quarter: p.quarter, kind: "past-not-taken" });
      }
    }
  }
  return layer;
}

/** Planned entries degree progress should still count as planned: not history, not already done, not in a past quarter. */
export function stillPlanned<T extends PlannedLike>(planned: T[], layer: PlanLayer): T[] {
  const flagged = new Set(layer.flags.map((f) => f.courseId));
  return planned.filter((p) => !layer.matched.has(p.courseId) && !flagged.has(p.courseId));
}

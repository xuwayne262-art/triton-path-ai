import { QUARTERS, todayInSanDiego } from "@/lib/housing/terms";
import { clockQuarter } from "@/lib/quarterClock";
import { currentPlanSlot } from "@/lib/planSlot";
import { termName } from "@/lib/plat";
import type { PlanQuarter, PlanYear } from "@/lib/plan/record";
import type { PlanTarget, QuarterRef } from "./types";

/**
 * Which quarter a request means, from the Registrar's calendar on San Diego
 * time — never a guess from the month on the student's own clock.
 *
 * Only the term the dataset carries has sections, so a change there goes on
 * "This term" with real times. Any other quarter is a slot of the 4-year
 * plan, which holds courses without sections. The plan's years carry no
 * dates, so a calendar quarter is placed by where this term already sits in
 * the plan; when the plan does not say, that is an assumption, and the
 * target says so.
 */

const SEASONS: Record<string, PlanQuarter> = { FA: "Fall", WI: "Winter", SP: "Spring" };
const REGULAR = QUARTERS.filter((q) => /^(FA|WI|SP)\d\d$/.test(q.key));

/** The academic year a term belongs to: Fall 2026, Winter and Spring 2027 are all 2026. */
function academicYear(term: string): number | null {
  const m = /^(FA|WI|SP)(\d\d)$/.exec(term);
  if (!m) return null;
  const year = 2000 + Number(m[2]);
  return m[1] === "FA" ? year : year - 1;
}

/** "WI27" for Winter 2027. */
export function termCodeFor(season: PlanQuarter, year: number): string {
  const code = season === "Fall" ? "FA" : season === "Winter" ? "WI" : "SP";
  return `${code}${String(year).slice(2)}`;
}

export interface PlanContext {
  /** The dataset's term, "FA26". */
  datasetTerm: string;
  planned: { course: { code: string }; year: PlanYear; quarter: PlanQuarter }[];
  scheduleCodes: string[];
  now?: Date;
}

/** Where this term sits in the 4-year plan, and whether the plan said so or it was assumed. */
function anchor(ctx: PlanContext): { year: PlanYear; assumed: boolean } | null {
  const slot = currentPlanSlot(ctx.datasetTerm, ctx.planned, ctx.scheduleCodes);
  return slot ? { year: slot.year, assumed: slot.basis === "none" } : null;
}

/** The 4-year slot a calendar term falls in, or null when it is outside the plan's four years. */
export function slotFor(term: string, ctx: PlanContext): { year: PlanYear; quarter: PlanQuarter; assumed: boolean } | null {
  const a = anchor(ctx);
  const ay = academicYear(term);
  const base = academicYear(ctx.datasetTerm);
  const quarter = SEASONS[term.slice(0, 2)];
  if (!a || ay == null || base == null || !quarter) return null;
  const year = a.year + (ay - base);
  return year >= 1 && year <= 4 ? { year: year as PlanYear, quarter, assumed: a.assumed } : null;
}

/** The calendar term a 4-year slot stands for, when the plan places this term. */
export function termForSlot(year: PlanYear, quarter: PlanQuarter, ctx: PlanContext): string | null {
  const a = anchor(ctx);
  const base = academicYear(ctx.datasetTerm);
  if (!a || base == null || a.assumed) return null;
  const ay = base + (year - a.year);
  return termCodeFor(quarter, quarter === "Fall" ? ay : ay + 1);
}

export const termTarget = (term: string): PlanTarget => ({ kind: "term", term, label: `${termName(term)} · This term` });

export function slotTarget(year: PlanYear, quarter: PlanQuarter, ctx: PlanContext): PlanTarget {
  const term = termForSlot(year, quarter, ctx);
  return {
    kind: "plan",
    slot: { year, quarter },
    term,
    label: term ? `${termName(term)} · Year ${year}` : `Year ${year} ${quarter}`,
  };
}

/** Every target the selector offers: this term, then the twelve quarters of the 4-year plan. */
export function targetOptions(ctx: PlanContext): PlanTarget[] {
  const out: PlanTarget[] = [termTarget(ctx.datasetTerm)];
  for (const year of [1, 2, 3, 4] as PlanYear[]) {
    for (const quarter of ["Fall", "Winter", "Spring"] as PlanQuarter[]) out.push(slotTarget(year, quarter, ctx));
  }
  return out;
}

export type QuarterResolution =
  | { kind: "target"; target: PlanTarget; note: string | null }
  | { kind: "ask"; text: string };

/** The quarter under way in San Diego, or the next to begin. */
function currentQuarter(now: Date): string | null {
  return clockQuarter(now.getTime())?.quarter.key ?? null;
}

/**
 * A quarter as the student named it, as a target. "Next quarter" is the
 * Registrar's next quarter after today's, said back in words; a season
 * alone is its next occurrence. A plan year and season is that slot.
 */
export function resolveQuarter(ref: QuarterRef, ctx: PlanContext): QuarterResolution {
  const now = ctx.now ?? new Date();
  const today = todayInSanDiego(now);
  if (ref.planYear && ref.season) {
    const target = slotTarget(ref.planYear, ref.season, ctx);
    const term = target.kind === "plan" ? target.term : null;
    return { kind: "target", target: term === ctx.datasetTerm ? termTarget(term) : target, note: null };
  }
  let term: string | null = null;
  if (ref.relative === "this") term = currentQuarter(now);
  else if (ref.relative === "next") {
    const cur = currentQuarter(now);
    const i = REGULAR.findIndex((q) => q.key === cur);
    const started = cur ? REGULAR[i] && REGULAR[i].begins <= today : false;
    term = i < 0 ? null : (started ? REGULAR[i + 1]?.key : REGULAR[i]?.key) ?? null;
  } else if (ref.season) {
    const upcoming = REGULAR.filter((q) => q.end >= today && SEASONS[q.key.slice(0, 2)] === ref.season);
    const exact = ref.year ? REGULAR.find((q) => q.key === termCodeFor(ref.season!, ref.year!)) : null;
    term = (ref.year ? exact?.key : upcoming[0]?.key) ?? (ref.year ? termCodeFor(ref.season, ref.year) : null);
  }
  if (!term) return { kind: "ask", text: "Which quarter do you mean?" };
  if (term === ctx.datasetTerm) {
    const said = ref.relative === "next" ? `Next quarter is ${termName(term)}.` : null;
    return { kind: "target", target: termTarget(term), note: said };
  }
  const slot = slotFor(term, ctx);
  if (!slot) {
    return { kind: "ask", text: `${termName(term)} isn't one of your 4-year plan's quarters. Which year should it go in?` };
  }
  const target = slotTarget(slot.year, slot.quarter, ctx);
  const named = ref.relative === "next" ? `Next quarter is ${termName(term)}` : termName(term);
  const note = slot.assumed
    ? `${named}. Your plan doesn't say which year this is, so I put it in Year ${slot.year} ${slot.quarter}. Change it in the quarter menu.`
    : `${named}, Year ${slot.year} ${slot.quarter} in your plan.`;
  return { kind: "target", target: slot.assumed ? { ...target, label: `${termName(term)} · Year ${slot.year} (assumed)` } : target, note };
}

/** Whether a target's sections are published, so its times can be checked. */
export const hasSections = (target: PlanTarget, datasetTerm: string) => target.kind === "term" && target.term === datasetTerm;

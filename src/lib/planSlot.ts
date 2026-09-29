import type { PlanQuarter, PlanYear } from "@/lib/plan/record";

/**
 * Where "now" is in the four-year plan.
 *
 * The plan's twelve quarters carry no calendar dates — Year 3 is whatever the
 * student makes it — so the page used to open its Year and Quarter pickers on
 * Year 1, Fall for everyone, and a junior adding this term's courses had to
 * move both first. The quarter is this term's own. The year is read from what
 * the student has already done with the plan, strongest evidence first.
 */

/** "FA26" -> "Fall". A summer session leads into the fall after it, since the plan has no summer. */
export function termQuarter(term: string): PlanQuarter | null {
  const season = /^([A-Z][A-Z0-9])\d{2}$/.exec(String(term ?? "").trim().toUpperCase())?.[1];
  if (season === "FA") return "Fall";
  if (season === "WI") return "Winter";
  if (season === "SP") return "Spring";
  if (season && /^S[123U]$/.test(season)) return "Fall";
  return null;
}

export interface PlanSlot {
  year: PlanYear;
  quarter: PlanQuarter;
  /**
   * What the year rests on: "schedule" — this term's own courses already sit
   * in that year; "plan" — the first year with anything planned; "none" —
   * nothing to go on, so Year 1.
   */
  basis: "schedule" | "plan" | "none";
}

interface Placed {
  course: { code: string };
  year: PlanYear;
  quarter: PlanQuarter;
}

/** The most common year, the earliest on a tie so the answer never depends on order. */
function commonestYear(rows: Placed[]): PlanYear {
  const n = new Map<PlanYear, number>();
  for (const r of rows) n.set(r.year, (n.get(r.year) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

/**
 * The slot the pickers should open on, or null until the term is known.
 *
 * 1. Where this term's courses already are — the student has said which year
 *    this term is. Placements in this quarter count before any elsewhere.
 * 2. The first year with anything in it: a plan starts where its student is,
 *    so a junior who plans from Year 3 on is shown Year 3.
 * 3. Year 1.
 */
export function currentPlanSlot(term: string, planned: Placed[], scheduleCodes: Iterable<string>): PlanSlot | null {
  const quarter = termQuarter(term);
  if (!quarter) return null;

  const codes = new Set(scheduleCodes);
  const mine = planned.filter((p) => codes.has(p.course.code));
  if (mine.length) {
    const here = mine.filter((p) => p.quarter === quarter);
    return { year: commonestYear(here.length ? here : mine), quarter, basis: "schedule" };
  }
  if (planned.length) {
    return { year: Math.min(...planned.map((p) => p.year)) as PlanYear, quarter, basis: "plan" };
  }
  return { year: 1, quarter, basis: "none" };
}

/**
 * The one year this term's courses were planned in, when they all share one —
 * for "Fall 2026 (Year 3) is already planned". Null when they are spread out
 * or not planned at all.
 */
export function scheduleYear(planned: Placed[], scheduleCodes: Iterable<string>): PlanYear | null {
  const codes = new Set(scheduleCodes);
  const years = new Set(planned.filter((p) => codes.has(p.course.code)).map((p) => p.year));
  return years.size === 1 ? [...years][0] : null;
}

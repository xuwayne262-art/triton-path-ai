import type { PlanSlot } from "@/lib/plan/change";
import { prereqCodes } from "@/lib/prereqs";
import { parsePrereq } from "./eligibility";
import { pastOfferings, subjectsOf, type PlanningContext } from "./engine";

/**
 * What moving a course to another quarter of the 4-year plan would affect,
 * from the prerequisites the data records — the multi-quarter check behind
 * "what changes if I move this prerequisite to Spring?".
 *
 * It looks both ways: courses planned at or before the new quarter that list
 * the moved course among their prerequisites, and the moved course's own
 * prerequisites planned at or after it. A dependency is "required" when the
 * prerequisite sentence reads unambiguously and the course is its only
 * option; otherwise it is "listed", which the student should check. Future
 * offerings are not known: the answer gives the grade archive's past terms
 * in that season, and says the schedule is not published.
 */

const ORDER: Record<string, number> = { Fall: 0, Winter: 1, Spring: 2 };
const at = (s: PlanSlot) => s.year * 3 + ORDER[s.quarter];

export interface MoveConsequences {
  code: string;
  to: PlanSlot;
  /** Planned courses that list the moved course as a prerequisite and would come no later than it. */
  dependents: { code: string; slot: PlanSlot; required: boolean }[];
  /** The moved course's prerequisites that the plan puts at or after its new quarter. */
  prerequisitesAfter: { code: string; slot: PlanSlot }[];
  /** The same season's terms it was taught in, newest first. */
  pastTerms: string[];
}

/** Whether `code` is the only option on some line of `text`. Null when the sentence cannot be read. */
function requiredBy(text: string | null | undefined, code: string): boolean | null {
  if (!text) return null;
  const parsed = parsePrereq(text);
  if (!parsed) return null;
  return parsed.lines.some((line) => line.length === 1 && line[0].code === code);
}

export async function moveConsequences(ctx: PlanningContext, code: string, to: PlanSlot): Promise<MoveConsequences> {
  const planned = ctx.plan.planned.filter((p) => p.course.code !== code);
  await ctx.data.load(subjectsOf([code, ...planned.map((p) => p.course.code)], ctx.data).slice(0, 16));
  const dependents: MoveConsequences["dependents"] = [];
  for (const p of planned) {
    const pre = ctx.data.detail(p.course.code)?.pre;
    if (!pre || !prereqCodes(pre).includes(code)) continue;
    if (at(p) > at(to)) continue;
    dependents.push({ code: p.course.code, slot: { year: p.year, quarter: p.quarter }, required: requiredBy(pre, code) === true });
  }
  const ownPre = prereqCodes(ctx.data.detail(code)?.pre);
  const prerequisitesAfter = planned
    .filter((p) => ownPre.includes(p.course.code) && at(p) >= at(to))
    .map((p) => ({ code: p.course.code, slot: { year: p.year, quarter: p.quarter } }));
  return { code, to, dependents, prerequisitesAfter, pastTerms: pastOfferings(ctx.data.detail(code), to.quarter) };
}

/** True when nothing the data records would be put out of order. */
export const moveIsClear = (m: MoveConsequences) => !m.dependents.length && !m.prerequisitesAfter.length;

/**
 * Adding a course to this term's plan from its own page, and undoing it,
 * without leaving the page.
 *
 * The change is the same one Plan with AI's server applies — `add_term` or
 * `set_sections`, checked and applied by patch.ts — but against this
 * browser's copy of the plan, which the sync engine then saves to the
 * account. Applying it here gives an exact inverse for Undo. Anything that
 * does not fit cleanly (no saved copy for this term yet, a copy for another
 * term, a pick that no longer matches the sections) is handed to the Planner
 * instead, which already knows how to ask.
 */

import { cleanPlanner, type PlannerDoc } from "./record";
import { applyPlanPatch, blankPlanner, describeOps, validatePlanPatch, type PatchData } from "./patch";
import type { PlanOp } from "./change";
import type { SectionSelection } from "@/lib/sections";

export type OnDevice =
  | { kind: "applied"; doc: PlannerDoc; inverse: PlanOp[]; label: string }
  | { kind: "handoff"; reason: "term" | "conflict" };

/** The plan in this browser, or a blank one for this term when there is none yet. */
function baseFor(stored: unknown, term: string): PlannerDoc | null {
  const doc = cleanPlanner(stored);
  if (!doc) return blankPlanner(term);
  if (doc.term && doc.term !== term) return null;
  return doc;
}

/** Adds `code` with `selection` (null: no sections yet), or switches its sections if it is already there. */
export function addOnDevice(stored: unknown, code: string, selection: SectionSelection | null, data: PatchData): OnDevice {
  const base = baseFor(stored, data.term);
  if (!base) return { kind: "handoff", reason: "term" };
  const on = base.schedule.some((e) => e.course.code === code);
  const ops: PlanOp[] = on
    ? [{ op: "set_sections", code, selection, expect: base.sections[code] ?? null }]
    : [{ op: "add_term", code, selection }];
  return apply(base, ops, data);
}

/** Applies a stored inverse, if nothing since has touched what it reverses. */
export function undoOnDevice(stored: unknown, inverse: PlanOp[], data: PatchData): OnDevice {
  const base = baseFor(stored, data.term);
  if (!base) return { kind: "handoff", reason: "term" };
  return apply(base, inverse, data);
}

function apply(base: PlannerDoc, ops: PlanOp[], data: PatchData): OnDevice {
  const problems = validatePlanPatch(base, ops, data);
  if (problems.length) return { kind: "handoff", reason: problems.some((p) => p.code === "TERM_CHANGED") ? "term" : "conflict" };
  const { doc, inverse } = applyPlanPatch(base, ops, data, Date.now().toString(36));
  return { kind: "applied", doc: { ...doc, term: data.term }, inverse, label: describeOps(ops, data.termName) };
}

import type { SectionSelection } from "@/lib/sections";
import type { PlanQuarter, PlanYear } from "./record";

/**
 * A change to the plan made by Plan with AI, as concrete operations.
 *
 * The planner's own buttons edit the browser's copy and let the sync save it.
 * A change Plan with AI makes goes the other way: the server applies these
 * operations to the account's copy in one compare-and-set write (see
 * patch.ts and /api/plan-ai/apply), so "Added to your plan" is said only
 * once the account holds it. Each applied change is logged in the plan with
 * its inverse, which is what lets a retried request be recognised instead of
 * applied twice, and an Undo reverse exactly that change.
 *
 * Nothing here knows about course data; patch.ts checks operations against
 * it. This module only fixes their shape, so the plan's cleaners can keep a
 * stored log without importing the planner.
 */

export interface PlanSlot {
  year: PlanYear;
  quarter: PlanQuarter;
}

export type PlanOp =
  /** Put a course on this term's schedule, with sections or (null) without. */
  | { op: "add_term"; code: string; selection: SectionSelection | null; entryId?: string }
  /** Take a course off this term's schedule. `expect` is the pick it must still have. */
  | { op: "remove_term"; code: string; expect: SectionSelection | null }
  /** Change a scheduled course's sections, if its pick is still `expect`. */
  | { op: "set_sections"; code: string; selection: SectionSelection | null; expect: SectionSelection | null }
  /** Put a course in one quarter of the 4-year plan. */
  | { op: "add_plan"; code: string; slot: PlanSlot; entryId?: string }
  /** Take a course out of the quarter it is planned in. */
  | { op: "remove_plan"; code: string; slot: PlanSlot }
  /** Move a planned course from one quarter to another. */
  | { op: "move_plan"; code: string; from: PlanSlot; to: PlanSlot };

export type PlanOpKind = PlanOp["op"];

export interface PlanChange {
  /** The request's own id, chosen by the browser: the same id twice is one change. */
  id: string;
  /** ISO-8601, when the account saved it. */
  at: string;
  /** What it did, in words the server wrote from the operations. */
  label: string;
  ops: PlanOp[];
  /** What reverses it, worked out from the plan as it was. */
  inverse: PlanOp[];
  /** Set on an undo: the change it reversed. */
  undoOf?: string;
  /** Set once undone: the change that reversed it. */
  undoneBy?: string;
}

/** Recent changes kept with a plan. Older ones can no longer be undone from the chat. */
export const MAX_LOG = 12;
/** Operations in one change: a full quarter swapped for another is about ten. */
export const MAX_OPS = 16;

export const CHANGE_ID = /^pc_[a-z0-9]{12,40}$/;
const COURSE_CODE = /^[A-Z]{2,5} \d{1,3}[A-Z]{0,4}$/;
const QUARTERS = new Set<string>(["Fall", "Winter", "Spring"]);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

export const isCourseCode = (v: unknown): v is string => typeof v === "string" && COURSE_CODE.test(v);

function slot(v: unknown): PlanSlot | null {
  if (!isObj(v)) return null;
  const { year, quarter } = v;
  if (year !== 1 && year !== 2 && year !== 3 && year !== 4) return null;
  if (typeof quarter !== "string" || !QUARTERS.has(quarter)) return null;
  return { year, quarter: quarter as PlanQuarter };
}

/** A section pick: a family, then one code per sub-section type. Null for "none". */
export function cleanSelection(v: unknown): SectionSelection | null {
  if (!isObj(v)) return null;
  const family = str(v.family, 16);
  if (!/^[A-Z0-9-]{1,16}$/.test(family)) return null;
  const parts: Record<string, string> = {};
  if (isObj(v.parts)) {
    for (const [type, code] of Object.entries(v.parts).slice(0, 8)) {
      const c = str(code, 16);
      if (/^[A-Z]{2}$/.test(type) && /^[A-Z0-9-]{1,16}$/.test(c)) parts[type] = c;
    }
  }
  return { family, parts };
}

/** One operation, rebuilt field by field; null when it is not one this build knows. */
export function cleanOp(v: unknown): PlanOp | null {
  if (!isObj(v) || !isCourseCode(v.code)) return null;
  const code = v.code;
  const entryId = str(v.entryId, 80);
  const withEntry = <T extends object>(o: T) => (entryId ? { ...o, entryId } : o);
  switch (v.op) {
    case "add_term":
      return withEntry({ op: "add_term" as const, code, selection: cleanSelection(v.selection) });
    case "remove_term":
      return { op: "remove_term", code, expect: cleanSelection(v.expect) };
    case "set_sections":
      return { op: "set_sections", code, selection: cleanSelection(v.selection), expect: cleanSelection(v.expect) };
    case "add_plan": {
      const s = slot(v.slot);
      return s ? withEntry({ op: "add_plan" as const, code, slot: s }) : null;
    }
    case "remove_plan": {
      const s = slot(v.slot);
      return s ? { op: "remove_plan", code, slot: s } : null;
    }
    case "move_plan": {
      const from = slot(v.from);
      const to = slot(v.to);
      return from && to ? { op: "move_plan", code, from, to } : null;
    }
    default:
      return null;
  }
}

/** Every operation must be readable: a list with one bad entry is refused whole, never applied in part. */
export function cleanOps(v: unknown, max = MAX_OPS): PlanOp[] | null {
  if (!Array.isArray(v) || v.length > max) return null;
  const out: PlanOp[] = [];
  for (const x of v) {
    const op = cleanOp(x);
    if (!op) return null;
    out.push(op);
  }
  return out;
}

function cleanChange(v: unknown): PlanChange | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 48);
  if (!CHANGE_ID.test(id)) return null;
  const ops = cleanOps(v.ops);
  const inverse = cleanOps(v.inverse);
  if (!ops || !inverse) return null;
  const out: PlanChange = { id, at: str(v.at, 40), label: str(v.label, 160), ops, inverse };
  const undoOf = str(v.undoOf, 48);
  const undoneBy = str(v.undoneBy, 48);
  if (CHANGE_ID.test(undoOf)) out.undoOf = undoOf;
  if (CHANGE_ID.test(undoneBy)) out.undoneBy = undoneBy;
  return out;
}

/** The log as stored: readable entries, one per id, oldest first, the newest MAX_LOG kept. */
export function cleanChangeLog(v: unknown): PlanChange[] {
  if (!Array.isArray(v)) return [];
  const byId = new Map<string, PlanChange>();
  for (const x of v.slice(-MAX_LOG * 2)) {
    const c = cleanChange(x);
    if (c && !byId.has(c.id)) byId.set(c.id, c);
  }
  return [...byId.values()].slice(-MAX_LOG);
}

/**
 * Two copies of the log brought together: every change either side holds,
 * once, and an undo recorded on either side stands. Ordered by when the
 * account saved each one, so the newest are the ones kept.
 */
export function mergeChangeLogs(a: PlanChange[] | undefined, b: PlanChange[] | undefined): PlanChange[] {
  const byId = new Map<string, PlanChange>();
  for (const c of [...(a ?? []), ...(b ?? [])]) {
    const had = byId.get(c.id);
    byId.set(c.id, had ? { ...had, ...(c.undoneBy || had.undoneBy ? { undoneBy: had.undoneBy ?? c.undoneBy } : {}) } : c);
  }
  return [...byId.values()]
    .sort((x, y) => x.at.localeCompare(y.at) || x.id.localeCompare(y.id))
    .slice(-MAX_LOG);
}

/** A fresh id for one request; the browser keeps it for every retry of that request. */
export function newChangeId(random: () => number = Math.random): string {
  let s = "";
  while (s.length < 20) s += Math.floor(random() * 36).toString(36);
  return `pc_${s.slice(0, 20)}`;
}

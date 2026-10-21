import type { CourseRow, SectionTuple } from "@/lib/plat";
import { findFamily, groupSections, sameSelection, type SectionSelection } from "@/lib/sections";
import { codeToId, majorSubjects, platRowToCourse } from "@/lib/plannerBridge";
import {
  DEFAULT_MAJOR, DEFAULT_MINOR,
  type PlannedCourse, type PlannerDoc, type ScheduleCourse,
} from "./record";
import { termOf } from "./term";
import type { PlanOp, PlanSlot } from "./change";

/**
 * Applying a Plan with AI change to a plan, as a pure function.
 *
 * The same code runs in the browser, to show what a suggestion would do and
 * to tell when one has gone stale, and on the server, where it is the last
 * word: /api/plan-ai/apply checks every operation against the account's
 * current plan and this term's published sections, applies them all or none,
 * and saves with the plan's revision check.
 *
 * Every operation states what it expects to find — the course still there,
 * its sections still the ones the suggestion was built on — so a suggestion
 * made before an edit in another tab cannot quietly undo that edit. The
 * inverse is worked out from the plan as it was, which is what an Undo
 * applies later, and it is checked the same way: an undo never restores a
 * snapshot over edits made since.
 */

/** Course data the operations are checked against. */
export interface PatchData {
  /** The term this dataset's schedule is for, "FA26". */
  term: string;
  termName: string;
  rowFor(code: string): CourseRow | undefined;
  /** This term's published sections; undefined when they have not been read. */
  sectionsFor(code: string): SectionTuple[] | undefined;
}

export type PatchProblemCode =
  | "UNKNOWN_COURSE"
  | "NOT_OFFERED"
  | "TERM_CHANGED"
  | "ALREADY_SCHEDULED"
  | "NOT_SCHEDULED"
  | "SECTIONS_CHANGED"
  | "INVALID_SECTIONS"
  | "SECTIONS_UNKNOWN"
  | "ALREADY_PLANNED"
  | "NOT_PLANNED"
  | "SCHEDULE_FULL"
  | "PLAN_FULL";

export interface PatchProblem {
  code: PatchProblemCode;
  course: string;
}

const MAX_SCHEDULE = 40;
const MAX_PLANNED = 120;

const isTermOp = (op: PlanOp) => op.op === "add_term" || op.op === "remove_term" || op.op === "set_sections";

/** A planner nobody has opened yet, set to this term. */
export function blankPlanner(term: string): PlannerDoc {
  return {
    major: DEFAULT_MAJOR, minor: DEFAULT_MINOR, college: null,
    schedule: [], planned: [], synced: [], sections: {}, term,
  };
}

const sameSlot = (a: PlanSlot, b: PlanSlot) => a.year === b.year && a.quarter === b.quarter;

/** A pick that names a lecture family and sub-sections this term actually has. Partial picks are fine. */
export function validSelection(sec: SectionTuple[], sel: SectionSelection): boolean {
  const family = findFamily(groupSections(sec), sel.family);
  if (!family) return false;
  return Object.entries(sel.parts).every(([type, code]) => {
    const part = family.parts.find((p) => p.type === type);
    return Boolean(part?.rows[code]?.length);
  });
}

/** Equal picks, where "none" and "absent" are the same answer. */
const samePick = (a: SectionSelection | null | undefined, b: SectionSelection | null | undefined) =>
  sameSelection(a ?? undefined, b ?? undefined);

interface Working {
  schedule: ScheduleCourse[];
  planned: PlannedCourse[];
  sections: Record<string, SectionSelection>;
}

function check(w: Working, op: PlanOp, data: PatchData): PatchProblemCode | null {
  const row = data.rowFor(op.code);
  if (!row) return "UNKNOWN_COURSE";
  const scheduled = w.schedule.some((e) => e.course.code === op.code);
  switch (op.op) {
    case "add_term": {
      if (scheduled) return "ALREADY_SCHEDULED";
      if (row.o !== 1) return "NOT_OFFERED";
      if (w.schedule.length >= MAX_SCHEDULE) return "SCHEDULE_FULL";
      if (op.selection) {
        const sec = data.sectionsFor(op.code);
        if (!sec) return "SECTIONS_UNKNOWN";
        if (!validSelection(sec, op.selection)) return "INVALID_SECTIONS";
      }
      return null;
    }
    case "remove_term":
      if (!scheduled) return "NOT_SCHEDULED";
      return samePick(w.sections[op.code], op.expect) ? null : "SECTIONS_CHANGED";
    case "set_sections": {
      if (!scheduled) return "NOT_SCHEDULED";
      if (!samePick(w.sections[op.code], op.expect)) return "SECTIONS_CHANGED";
      if (op.selection) {
        const sec = data.sectionsFor(op.code);
        if (!sec) return "SECTIONS_UNKNOWN";
        if (!validSelection(sec, op.selection)) return "INVALID_SECTIONS";
      }
      return null;
    }
    case "add_plan":
      if (w.planned.some((p) => p.course.code === op.code)) return "ALREADY_PLANNED";
      return w.planned.length >= MAX_PLANNED ? "PLAN_FULL" : null;
    case "remove_plan":
      return w.planned.some((p) => p.course.code === op.code && sameSlot(p, op.slot)) ? null : "NOT_PLANNED";
    case "move_plan":
      return w.planned.some((p) => p.course.code === op.code && sameSlot(p, op.from)) ? null : "NOT_PLANNED";
  }
}

/** Applies one operation to the working copy and returns what reverses it. Assumes `check` passed. */
function step(w: Working, op: PlanOp, data: PatchData, major: string, stamp: string): PlanOp {
  const row = data.rowFor(op.code)!;
  switch (op.op) {
    case "add_term": {
      const course = platRowToCourse(row, majorSubjects(major));
      w.schedule.push({ course, id: op.entryId ?? `${codeToId(op.code)}-${stamp}` });
      if (op.selection) w.sections[op.code] = op.selection;
      return { op: "remove_term", code: op.code, expect: op.selection ?? w.sections[op.code] ?? null };
    }
    case "remove_term": {
      const i = w.schedule.findIndex((e) => e.course.code === op.code);
      const [entry] = w.schedule.splice(i, 1);
      const had = w.sections[op.code] ?? null;
      delete w.sections[op.code];
      return { op: "add_term", code: op.code, selection: had, entryId: entry.id };
    }
    case "set_sections": {
      const had = w.sections[op.code] ?? null;
      if (op.selection) w.sections[op.code] = op.selection;
      else delete w.sections[op.code];
      return { op: "set_sections", code: op.code, selection: had, expect: op.selection };
    }
    case "add_plan": {
      // No meeting time: a later quarter's schedule is not published, and the
      // current term's time would put a class on a day it may not meet then.
      const course = platRowToCourse(row, majorSubjects(major));
      delete course.time;
      w.planned.push({ courseId: op.entryId ?? `${codeToId(op.code)}-${stamp}`, course, ...op.slot });
      return { op: "remove_plan", code: op.code, slot: op.slot };
    }
    case "remove_plan": {
      const i = w.planned.findIndex((p) => p.course.code === op.code && sameSlot(p, op.slot));
      const [entry] = w.planned.splice(i, 1);
      return { op: "add_plan", code: op.code, slot: op.slot, entryId: entry.courseId };
    }
    case "move_plan": {
      const i = w.planned.findIndex((p) => p.course.code === op.code && sameSlot(p, op.from));
      w.planned[i] = { ...w.planned[i], ...op.to };
      return { op: "move_plan", code: op.code, from: op.to, to: op.from };
    }
  }
}

function working(doc: PlannerDoc): Working {
  return { schedule: [...doc.schedule], planned: [...doc.planned], sections: { ...doc.sections } };
}

/**
 * What would stop `ops` applying to `doc` as written, in order: each
 * operation is checked against the plan as the ones before it leave it.
 * An empty list means all of them apply.
 */
export function validatePlanPatch(doc: PlannerDoc, ops: PlanOp[], data: PatchData): PatchProblem[] {
  const problems: PatchProblem[] = [];
  if (ops.some(isTermOp) && termOf(doc) !== data.term) {
    return [{ code: "TERM_CHANGED", course: ops.find(isTermOp)!.code }];
  }
  const w = working(doc);
  for (const op of ops) {
    const problem = check(w, op, data);
    if (problem) {
      problems.push({ code: problem, course: op.code });
      continue;
    }
    step(w, op, data, doc.major, "check");
  }
  return problems;
}

/**
 * The plan with every operation applied, and the operations that reverse
 * them (last first). Throws if any does not apply: callers validate first,
 * and a change is all or nothing.
 */
export function applyPlanPatch(
  doc: PlannerDoc,
  ops: PlanOp[],
  data: PatchData,
  stamp: string,
): { doc: PlannerDoc; inverse: PlanOp[] } {
  const problems = validatePlanPatch(doc, ops, data);
  if (problems.length) throw new Error(`Plan change does not apply: ${problems.map((p) => p.code).join(", ")}`);
  const w = working(doc);
  const inverse = ops.map((op, i) => step(w, op, data, doc.major, `${stamp}-${i}`)).reverse();
  return { doc: { ...doc, schedule: w.schedule, planned: w.planned, sections: w.sections }, inverse };
}

const slotLabel = (s: PlanSlot) => `Year ${s.year} ${s.quarter}`;

function list(codes: string[]): string {
  if (codes.length <= 2) return codes.join(" and ");
  return `${codes.slice(0, -1).join(", ")} and ${codes[codes.length - 1]}`;
}

/** One line saying what a change does, written from its operations alone. */
export function describeOps(ops: PlanOp[], termName: string): string {
  const term = termName || "this term";
  const of = (kind: PlanOp["op"]) => ops.filter((o) => o.op === kind);
  const parts: string[] = [];
  const added = of("add_term").map((o) => o.code);
  const removed = of("remove_term").map((o) => o.code);
  const resectioned = of("set_sections").map((o) => o.code);
  if (added.length) parts.push(`added ${list(added)} to ${term}`);
  if (removed.length) parts.push(`removed ${list(removed)} from ${term}`);
  if (resectioned.length) parts.push(`changed sections for ${list(resectioned)}`);
  for (const o of ops) {
    if (o.op === "add_plan") parts.push(`added ${o.code} to ${slotLabel(o.slot)}`);
    if (o.op === "remove_plan") parts.push(`removed ${o.code} from ${slotLabel(o.slot)}`);
    if (o.op === "move_plan") parts.push(`moved ${o.code} to ${slotLabel(o.to)}`);
  }
  if (!parts.length) return "No change";
  const text = parts.join("; ");
  const line = text.charAt(0).toUpperCase() + text.slice(1);
  return line.length <= 140 ? line : `Changed ${ops.length} courses`;
}

/**
 * A short fingerprint of what a suggestion depends on: this term's courses
 * and sections, and the 4-year plan. A suggestion built on one fingerprint
 * is stale once the plan has another.
 */
export function planFingerprint(doc: Pick<PlannerDoc, "schedule" | "sections" | "planned" | "term">): string {
  const schedule = doc.schedule.map((e) => e.course.code).sort();
  const parts = [
    doc.term ?? "",
    ...schedule.map((code) => {
      const s = doc.sections[code];
      return s ? `${code}:${s.family}:${Object.keys(s.parts).sort().map((k) => `${k}=${s.parts[k]}`).join(",")}` : code;
    }),
    "|",
    ...doc.planned.map((p) => `${p.course.code}@${p.year}${p.quarter}`).sort(),
  ];
  // FNV-1a: a change detector, not a secret.
  let h = 0x811c9dc5;
  for (const ch of parts.join(";")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

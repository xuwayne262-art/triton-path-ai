import type { ParsedHistory } from "@/lib/history/parse";
import {
  levelBand, prereqKnown, searchCourses, termOrder,
  type CourseDetail, type CourseRow, type GEFile, type SectionTuple,
} from "@/lib/plat";
import { byPopularity, isArrangedCourse, majorSubjects } from "@/lib/plannerBridge";
import {
  groupSections, isComplete as pickComplete, sameSelection, sectionSeatsAt, sectionWhen, sectionWhere, typeLabel,
  type SectionSelection,
} from "@/lib/sections";
import { sumSeatsAt } from "@/lib/freshness";
import type { PlannedCourse } from "@/lib/plan/record";
import type { PlanOp } from "@/lib/plan/change";
import { checkPrerequisites, noPrereqConfirmed, prereqCheck, studentRecord, type StudentRecord } from "./eligibility";
import { goalScope, goalSources, requirementCheck, type Goal } from "./requirements";
import {
  configFor, configurations, factsOf, findRelaxation, keepsConstraints, meetingsClash, finalsClash,
  pickOptions, search, unscheduledConfig, type Angle, type Config, type SearchCourse,
} from "./schedule";
import type {
  Check, Constraints, CourseCard, PlanFacts, PlanTarget, Preference, Proposal, ReasonCode, SearchOutcome, SourceRef,
} from "./types";
import { unitRange } from "./warren";

/**
 * Plan with AI's planning engine: everything after a request has been read.
 *
 * It retrieves candidates from UCSDPlans' own data, checks each one —
 * prerequisites against the saved Academic History, the requirement asked
 * about, offering, seats — fits sections around the plan as it stands, and
 * builds drafts with the bounded search in schedule.ts. What comes out is a
 * set of cards and proposals whose every claim is a check with a status and
 * a basis; the words around them are filled in by explain.ts from templates.
 * No model is involved past the request.
 */

/** The course data the engine reads, loaded by the page (or the tests) beforehand. */
export interface DataAccess {
  /** The dataset's term, "FA26". */
  term: string;
  termName: string;
  rows: CourseRow[];
  row(code: string): CourseRow | undefined;
  ge: GEFile | null;
  /** A course's full record once its subject file is loaded. */
  detail(code: string): CourseDetail | undefined;
  /** Loads subject files. Failures leave their courses without detail, which every check reads as "not checked". */
  load(subjects: string[]): Promise<void>;
  /** The oldest seat count in the dataset, for "seats as of". */
  seatsAsOf: string | null;
}

export interface Student {
  major: string;
  /** A GE key, "warren". */
  college: string | null;
  history: ParsedHistory | null;
}

export interface PlanState {
  /** The term this term's schedule belongs to. */
  term: string | undefined;
  schedule: { code: string; units: number; title: string }[];
  selections: Record<string, SectionSelection>;
  planned: PlannedCourse[];
  /** lib/plan/patch.ts planFingerprint of the plan as shown. */
  fingerprint: string;
}

export interface PlanningContext {
  data: DataAccess;
  student: Student;
  plan: PlanState;
}

/** A request, resolved: where, under what rules, toward what, keeping what. */
export interface Ask {
  target: PlanTarget;
  constraints: Constraints;
  preferences: Preference[];
  goal: Goal | null;
  /** Departments to draw from, when the request named some. */
  subjects: string[];
  /** Courses the student named. */
  courses: string[];
  /** Courses that must stay exactly as they are. */
  keep: string[];
  topic: string | null;
}

/** The context from the planner's own state: the one source of truth the ordinary planner uses. */
export function getPlanningContext(data: DataAccess, student: Student, plan: PlanState): PlanningContext {
  return { data, student, plan };
}

// ── Records and evidence ─────────────────────────────────────────────────────

const PLAN_ORDER: Record<string, number> = { Fall: 0, Winter: 1, Spring: 2 };

/**
 * What the student will have done before the target quarter: their record,
 * plus what the plan puts before it — this term's schedule counts for any
 * later quarter, and earlier 4-year plan quarters count, all conditionally.
 */
export function recordFor(ctx: PlanningContext, target: PlanTarget): StudentRecord {
  const before: string[] = [];
  if (target.kind === "plan") {
    const at = target.slot.year * 3 + PLAN_ORDER[target.slot.quarter];
    for (const p of ctx.plan.planned) {
      if (p.year * 3 + PLAN_ORDER[p.quarter] < at) before.push(p.course.code);
    }
    for (const s of ctx.plan.schedule) before.push(s.code);
  }
  return studentRecord(ctx.student.history, before);
}

/** Terms a course was taught in the same season, newest first, from the grade archive: "taught in Winter 2026". */
export function pastOfferings(detail: CourseDetail | undefined, season: string): string[] {
  const code = season === "Fall" ? "FA" : season === "Winter" ? "WI" : "SP";
  const terms = new Set((detail?.hist ?? []).map((h) => h[0]).filter((t) => t.startsWith(code)));
  return [...terms].sort((a, b) => termOrder(b) - termOrder(a));
}

/** Units the planner counts for a course: the catalog's fixed number, or the low end of a range. */
export function countedUnits(row: CourseRow): number {
  return unitRange(row.u)?.min ?? 4;
}

/** Every check for one course in one target, except its sections' times (see fitting). */
export function courseChecks(ctx: PlanningContext, row: CourseRow, target: PlanTarget, goal: Goal | null): Check[] {
  const detail = ctx.data.detail(row.k);
  const checks: Check[] = [];
  if (detail) checks.push(...checkPrerequisites(row, detail.pre, detail.res, recordFor(ctx, target)));
  else checks.push({ status: "unknown", code: "PREREQ_UNREADABLE", basis: "official", course: row.k, detail: { text: "Course details didn't load." } });
  if (goal) checks.push(requirementCheck(row, goal, ctx.data.ge));
  const range = unitRange(row.u);
  if (range && range.min !== range.max) checks.push({ status: "unknown", code: "UNITS_VARIABLE", basis: "official", course: row.k, detail: { units: row.u ?? "" } });
  if (target.kind === "plan") {
    const past = pastOfferings(detail, target.slot.quarter);
    checks.push({
      status: "unknown", code: "SECTIONS_UNPUBLISHED", basis: "official", course: row.k,
      detail: { quarter: target.label, past: past.slice(0, 2).join(", ") },
    });
  }
  return checks;
}

/**
 * The seat check for a pick, dated by its own sections' counts — each is
 * counted on its own clock, so the oldest of them is what the number is
 * worth — never by the dataset's newest. A count is never called live.
 */
function seatCheck(ctx: PlanningContext, c: Config): Check {
  const asOf = sumSeatsAt(c.rows.map(sectionSeatsAt), ctx.data.detail(c.course)?.seatsAt ?? null) ?? "";
  if (c.waitlistOnly) return { status: "unknown", code: "WAITLIST_ONLY", basis: "official", course: c.course, detail: { asOf } };
  if (c.full) return { status: "fail", code: "SEATS_FULL", basis: "official", course: c.course, detail: { asOf } };
  if (c.seatsOpen == null) return { status: "unknown", code: "SEATS_UNKNOWN", basis: "official", course: c.course };
  return { status: "pass", code: "SEATS_OPEN", basis: "official", course: c.course, detail: { open: c.seatsOpen, asOf } };
}

// ── Candidates ───────────────────────────────────────────────────────────────

/**
 * Courses worth considering for a request, best first: within the goal's
 * scope (a Warren program's department, a GE list, the named subjects or
 * courses), offered in the target term when it has sections, not already
 * taken, scheduled or planned, and — unless the student named them —
 * neither graduate nor arranged (independent study, internships).
 */
export function retrieveCandidates(ctx: PlanningContext, ask: Ask, limit = 40): CourseRow[] {
  const { data, plan, student } = ctx;
  const record = studentRecord(student.history);
  const taken = new Set([...record.completed.keys(), ...record.inProgress]);
  const busy = new Set([...plan.schedule.map((s) => s.code), ...plan.planned.map((p) => p.course.code)]);
  const named = new Set(ask.courses);
  const scope = ask.goal ? goalScope(ask.goal, data.ge) : null;
  const subjects = scope?.subjects ?? (ask.subjects.length ? ask.subjects : null);
  const codes = scope?.codes ?? null;
  const sectioned = ask.target.kind === "term";

  let pool: CourseRow[];
  if (named.size) pool = [...named].map((c) => data.row(c)).filter((r): r is CourseRow => Boolean(r));
  else if (ask.topic) pool = searchCourses(data.rows, ask.topic, 80).map((h) => h.row);
  else pool = data.rows;

  const majorSubs = majorSubjects(student.major);
  const collegeLists = student.college
    ? new Set((data.ge?.areas ?? []).filter((a) => a.college === student.college).flatMap((a) => data.ge?.lists[a.key] ?? []))
    : new Set<string>();
  const inScope = (r: CourseRow) => {
    if (named.size) return true;
    if (codes) return codes.has(r.k) && (!subjects || subjects.includes(r.s));
    if (subjects) return subjects.includes(r.s);
    if (ask.topic) return true;
    // No goal: the student's major and their college's GE lists.
    return majorSubs.has(r.s) || collegeLists.has(r.k);
  };

  const out = pool.filter((r) => {
    if (!inScope(r)) return false;
    if (busy.has(r.k) || taken.has(r.k)) return false;
    if (sectioned && r.o !== 1) return false;
    if (!sectioned && r.ct === 0 && r.o !== 1) return false;
    if (!named.has(r.k) && (levelBand(r) === 2 || isArrangedCourse(r))) return false;
    if (ask.constraints.noPrerequisites && (r.pr || !prereqKnown(r))) return false;
    if (ask.constraints.units.max != null && countedUnits(r) > ask.constraints.units.max) return false;
    if (ask.constraints.openSeats && sectioned && !(r.sa != null && r.sa > 0)) return false;
    return true;
  });

  const goalHit = (r: CourseRow) => (ask.goal ? (requirementCheck(r, ask.goal, data.ge).status !== "fail" ? 1 : 0) : 0);
  const majorHit = (r: CourseRow) => (majorSubs.has(r.s) ? 1 : 0);
  return out
    .sort((a, b) => goalHit(b) - goalHit(a) || majorHit(b) - majorHit(a) || byPopularity(a, b) || a.k.localeCompare(b.k))
    .slice(0, limit);
}

/** The subjects whose files a set of courses needs. */
export const subjectsOf = (codes: Iterable<string>, data: DataAccess) =>
  [...new Set([...codes].map((c) => data.row(c)?.s ?? c.split(" ")[0]))];

// ── The plan as it stands ────────────────────────────────────────────────────

export interface Standing {
  /** Scheduled courses with a complete pick: what a new course must fit around. */
  fixed: Config[];
  /** Scheduled courses with sections but no complete pick: nothing can be checked against them. */
  undecided: string[];
  /** Scheduled courses with no sections at all this term. */
  unscheduled: string[];
  units: Record<string, number>;
}

/** This term's schedule as configurations. */
export function standing(ctx: PlanningContext): Standing {
  const fixed: Config[] = [];
  const undecided: string[] = [];
  const unscheduled: string[] = [];
  const units: Record<string, number> = {};
  for (const s of ctx.plan.schedule) {
    units[s.code] = s.units;
    const sec = ctx.data.detail(s.code)?.sec ?? [];
    const sel = ctx.plan.selections[s.code];
    if (!groupSections(sec).length) { unscheduled.push(s.code); continue; }
    const c = sel && pickComplete(groupSections(sec), sel) ? configFor(s.code, sec, sel) : null;
    if (c) fixed.push(c);
    else undecided.push(s.code);
  }
  return { fixed, undecided, unscheduled, units };
}

/** Facts for this term's schedule as it is. */
export function currentFacts(ctx: PlanningContext): PlanFacts {
  const s = standing(ctx);
  const facts = factsOf(s.fixed, s.units);
  return {
    ...facts,
    units: ctx.plan.schedule.reduce((n, c) => n + c.units, 0),
    courses: ctx.plan.schedule.length,
    unscheduled: [...s.undecided, ...s.unscheduled],
  };
}

// ── One course into the week ─────────────────────────────────────────────────

export interface Fit {
  config: Config | null;
  /** Why no configuration fits, when none does. */
  blocked: { kind: "clash"; with: string[]; finals: boolean } | { kind: "constraint" } | { kind: "no-sections" } | null;
}

/** Ranks configurations by the student's soft preferences, given what is already on the week. */
function rankConfigs(configs: Config[], fixed: Config[], prefs: Preference[]): Config[] {
  const days = new Set(fixed.flatMap((c) => c.meetings.map((m) => m.day)));
  const cost = (c: Config) => {
    const newDays = new Set(c.meetings.map((m) => m.day).filter((d) => !days.has(d))).size;
    const earliest = c.meetings.length ? Math.min(...c.meetings.map((m) => m.startMin)) : 12 * 60;
    const latest = c.meetings.length ? Math.max(...c.meetings.map((m) => m.endMin)) : 12 * 60;
    const gaps = factsOf([...fixed, c], {}).gapMinutes;
    return newDays * (prefs.includes("fewer_days") ? 500 : 40)
      + gaps * (prefs.includes("fewer_gaps") ? 3 : 0.3)
      - earliest * (prefs.includes("later_start") ? 2 : 0.05)
      + latest * (prefs.includes("earlier_finish") ? 2 : 0)
      + (c.full || c.waitlistOnly ? 400 : 0)
      - (c.seatsOpen ?? 0) * 0.01;
  };
  return [...configs].sort((a, b) => cost(a) - cost(b) || a.key.localeCompare(b.key));
}

/** The best way a course's sections fit around `fixed`, or why none does. */
export function fitCourse(
  code: string,
  sec: SectionTuple[] | undefined,
  fixed: Config[],
  constraints: Constraints,
  prefs: Preference[],
): Fit {
  if (!sec || !groupSections(sec).length) return { config: null, blocked: { kind: "no-sections" } };
  const all = configurations(code, sec, { earliestStart: null, latestEnd: null, avoidDays: [], openSeats: false }, 60);
  const allowed = all.filter((c) => keepsConstraints(c, constraints));
  if (!allowed.length) return { config: null, blocked: { kind: "constraint" } };
  const clear = allowed.filter((c) => !fixed.some((f) => meetingsClash(c, f) || finalsClash(c, f)));
  if (clear.length) return { config: rankConfigs(clear, fixed, prefs)[0], blocked: null };
  const withWhom = new Set<string>();
  let finals = false;
  for (const c of allowed) {
    for (const f of fixed) {
      if (meetingsClash(c, f)) withWhom.add(f.course);
      if (finalsClash(c, f)) { withWhom.add(f.course); finals = true; }
    }
  }
  return { config: null, blocked: { kind: "clash", with: [...withWhom], finals } };
}

/** The schedule checks of a configuration placed on a week: clashes, finals, times. */
export function placementChecks(c: Config, fixed: Config[], undecided: string[]): Check[] {
  const out: Check[] = [];
  const clash = fixed.filter((f) => meetingsClash(c, f)).map((f) => f.course);
  const finalClash = fixed.filter((f) => finalsClash(c, f)).map((f) => f.course);
  out.push(clash.length
    ? { status: "fail", code: "TIME_CONFLICT", basis: "official", course: c.course, detail: { with: clash.join(", ") } }
    : c.tba
      ? { status: "unknown", code: "TIME_TBA", basis: "official", course: c.course }
      : { status: "pass", code: "NO_CONFLICT", basis: "official", course: c.course, detail: { against: fixed.length } });
  if (finalClash.length) out.push({ status: "fail", code: "FINAL_CONFLICT", basis: "official", course: c.course, detail: { with: finalClash.join(", ") } });
  else if (!c.finals.length) out.push({ status: "unknown", code: "FINAL_UNKNOWN", basis: "official", course: c.course });
  if (undecided.length) out.push({ status: "unknown", code: "SECTIONS_INCOMPLETE", basis: "official", course: c.course, detail: { courses: undecided.join(", ") } });
  return out;
}

// ── Cards ────────────────────────────────────────────────────────────────────

const REASON_ORDER = [
  "REQ_OFFICIAL_LIST", "REQ_RULE", "REQ_COMMUNITY_LIST", "PREREQ_NONE_STATED", "PREREQ_NONE_LISTED", "PREREQ_MET", "NO_CONFLICT", "SEATS_OPEN",
];
const CAVEAT_ORDER = [
  "TIME_CONFLICT", "FINAL_CONFLICT", "PREREQ_MISSING", "REQ_EXCLUDED", "SECTIONS_UNPUBLISHED", "TIME_TBA", "SECTIONS_INCOMPLETE",
  "RESTRICTED", "PREREQ_CONSENT", "PREREQ_PLANNED", "PREREQ_NO_RECORD", "PREREQ_UNREADABLE", "PREREQ_NOT_IN_CATALOG",
  "SEATS_FULL", "WAITLIST_ONLY", "UNITS_VARIABLE", "FINAL_UNKNOWN", "REQ_COMMUNITY_LIST", "REQ_RULE",
];

/** The one reason a card leads with, and the one caveat it must not hide. */
export function leadChecks(checks: Check[]): { reason: Check | null; caveat: Check | null } {
  const reason = REASON_ORDER.map((code) => checks.find((c) => c.code === code && c.status !== "fail")).find(Boolean) ?? null;
  const caveat = CAVEAT_ORDER.map((code) => checks.find((c) => c.code === code && c.status !== "pass" && c !== reason)).find(Boolean) ?? null;
  return { reason, caveat };
}

export function cardFor(ctx: PlanningContext, row: CourseRow, config: Config | null, checks: Check[]): CourseCard {
  const { reason, caveat } = leadChecks(checks);
  const seen = new Set<string>();
  const meetings = (config?.rows ?? [])
    .filter((r) => {
      const key = `${r[0]}|${r[2]}|${r[3]}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((r) => ({ label: `${typeLabel(r[1])} ${r[0]}`, when: sectionWhen(r), where: sectionWhere(r) }));
  const final = config?.finals[0];
  return {
    code: row.k,
    title: row.t,
    units: row.u ?? "",
    unitsCounted: countedUnits(row),
    selection: config?.selection ?? null,
    meetings,
    final: final ? `${final.date}|${final.startMin}|${final.endMin}` : null,
    instructor: config?.instructor || row.p || null,
    reason,
    caveat,
    checks,
    grades: row.g != null && row.g > 0 && row.r > 0 ? { gpa: row.g, terms: row.r } : null,
    rating: row.pq != null && row.pq > 0 && row.pn ? { quality: row.pq, count: row.pn } : null,
  };
}

// ── Find a course that fits ──────────────────────────────────────────────────

export interface FindResult {
  cards: CourseCard[];
  /** Candidates that matched the request but not the week, with why. */
  misses: { code: string; why: Fit["blocked"] }[];
  /** How many candidates were considered at all. */
  considered: number;
  undecided: string[];
  sources: SourceRef[];
}

/**
 * Courses within the request that fit the plan as it is, each with its best
 * sections. `exclude` skips courses already shown, for "show other courses".
 */
export async function findFitting(ctx: PlanningContext, ask: Ask, max = 5, exclude: string[] = []): Promise<FindResult> {
  const skip = new Set(exclude);
  const pool = retrieveCandidates(ctx, ask, 40 + skip.size).filter((r) => !skip.has(r.k));
  await ctx.data.load(subjectsOf([...pool.map((r) => r.k), ...ctx.plan.schedule.map((s) => s.code)], ctx.data).slice(0, 12));
  const st = standing(ctx);
  const cards: CourseCard[] = [];
  const misses: FindResult["misses"] = [];
  for (const row of pool) {
    if (cards.length >= max) break;
    const checks = courseChecks(ctx, row, ask.target, ask.goal);
    if (ask.goal && checks.some((c) => (c.code === "REQ_EXCLUDED" || c.code === "REQ_NOT_LISTED"))) continue;
    if (ask.constraints.noPrerequisites && !noPrereqConfirmed(checks)) continue;
    if (ask.constraints.prereqsMet && prereqCheck(checks)?.status !== "pass") continue;
    if (ask.target.kind === "plan") {
      cards.push(cardFor(ctx, row, null, checks));
      continue;
    }
    const fit = fitCourse(row.k, ctx.data.detail(row.k)?.sec, st.fixed, ask.constraints, ask.preferences);
    if (!fit.config) {
      if (misses.length < 6) misses.push({ code: row.k, why: fit.blocked });
      continue;
    }
    cards.push(cardFor(ctx, row, fit.config, [...checks, ...placementChecks(fit.config, st.fixed, st.undecided), seatCheck(ctx, fit.config)]));
  }
  const sources = [
    ...(ask.goal ? goalSources(ask.goal, ctx.data.ge) : []),
    { id: "schedule", label: `UCSD Class Planner, ${ctx.data.termName} schedule`, asOf: ctx.data.seatsAsOf },
  ];
  return { cards, misses, considered: pool.length, undecided: st.undecided, sources };
}

// ── Proposals ────────────────────────────────────────────────────────────────

let proposalSeq = 0;
/** Unique within a page; stable while a proposal is on screen. */
export const proposalId = () => `p${Date.now().toString(36)}${(proposalSeq++).toString(36)}`;

const ANGLE_TITLE: Record<Angle, string> = {
  draft: "Draft",
  fewer_days: "Fewer campus days",
  fewer_gaps: "Shorter gaps",
  later_start: "Later start",
  requirements: "More requirement progress",
};

/** A proposal adding one course (with its sections, or none) to the target. */
export function addProposal(ctx: PlanningContext, card: CourseCard, target: PlanTarget): Proposal {
  const op: PlanOp = target.kind === "term"
    ? { op: "add_term", code: card.code, selection: card.selection }
    : { op: "add_plan", code: card.code, slot: target.slot };
  return proposalFromOps(ctx, target, [op], [card], { title: `Add ${card.code}`, reasons: [] });
}

/** A proposal from operations, with its before and after facts and every check. */
export function proposalFromOps(
  ctx: PlanningContext,
  target: PlanTarget,
  ops: PlanOp[],
  adds: CourseCard[],
  meta: { title: string; reasons: ReasonCode[]; keep?: string[]; sources?: SourceRef[]; extraChecks?: Check[] },
): Proposal {
  const before = currentFacts(ctx);
  let after = before;
  if (target.kind === "term") {
    const st = standing(ctx);
    const removed = new Set(ops.filter((o) => o.op === "remove_term").map((o) => o.code));
    const resectioned = new Map(ops.flatMap((o) => (o.op === "set_sections" ? [[o.code, o.selection] as const] : [])));
    const configs: Config[] = [];
    const units = { ...st.units };
    for (const f of st.fixed) {
      if (removed.has(f.course)) continue;
      const sel = resectioned.get(f.course);
      if (sel) {
        const c = configFor(f.course, ctx.data.detail(f.course)?.sec ?? [], sel);
        if (c) configs.push(c);
      } else configs.push(f);
    }
    for (const o of ops) {
      if (o.op !== "add_term") continue;
      const row = ctx.data.row(o.code);
      units[o.code] = row ? countedUnits(row) : 4;
      const c = o.selection ? configFor(o.code, ctx.data.detail(o.code)?.sec ?? [], o.selection) : null;
      configs.push(c ?? unscheduledConfig(o.code));
    }
    const keepUnscheduled = [...st.undecided, ...st.unscheduled].filter((c) => !removed.has(c));
    for (const c of keepUnscheduled) {
      const sel = resectioned.get(c);
      const cfg = sel ? configFor(c, ctx.data.detail(c)?.sec ?? [], sel) : null;
      configs.push(cfg ?? unscheduledConfig(c));
    }
    const facts = factsOf(configs, units);
    after = facts;
  } else {
    const removed = new Set(ops.filter((o) => o.op === "remove_plan" || o.op === "move_plan").map((o) => o.code));
    const inSlot = ctx.plan.planned.filter((p) => p.year === target.slot.year && p.quarter === target.slot.quarter && !removed.has(p.course.code));
    const added = ops.filter((o) => (o.op === "add_plan" || o.op === "move_plan")).map((o) => o.code);
    const units = inSlot.reduce((n, p) => n + p.course.units, 0) + added.reduce((n, c) => n + (ctx.data.row(c) ? countedUnits(ctx.data.row(c)!) : 4), 0);
    const beforeUnits = ctx.plan.planned.filter((p) => p.year === target.slot.year && p.quarter === target.slot.quarter).reduce((n, p) => n + p.course.units, 0);
    const empty: PlanFacts = { units: 0, courses: 0, days: [], earliest: null, latest: null, gapMinutes: 0, conflicts: 0, unscheduled: [] };
    after = { ...empty, units, courses: inSlot.length + added.length, unscheduled: [...inSlot.map((p) => p.course.code), ...added] };
    return finish({ ...empty, units: beforeUnits, courses: ctx.plan.planned.filter((p) => p.year === target.slot.year && p.quarter === target.slot.quarter).length }, after);
  }
  return finish(before, after);

  function finish(b: PlanFacts, a: PlanFacts): Proposal {
    return {
      id: proposalId(),
      target,
      base: ctx.plan.fingerprint,
      title: meta.title,
      ops,
      keep: meta.keep ?? [],
      adds,
      removes: ops.flatMap((o) => (o.op === "remove_term" || o.op === "remove_plan" ? [o.code] : [])),
      resections: ops.flatMap((o) => (o.op === "set_sections" ? [o.code] : [])),
      before: b,
      after: a,
      checks: [...adds.flatMap((c) => c.checks), ...(meta.extraChecks ?? [])],
      reasons: meta.reasons,
      sources: meta.sources ?? [],
    };
  }
}

// ── Build and improve ────────────────────────────────────────────────────────

export interface OptionsResult {
  proposals: Proposal[];
  outcome: SearchOutcome;
  /** The plan as it stands could not be read for times: these courses have no complete pick. */
  undecided: string[];
  /** Candidates considered for adding. */
  considered: number;
  /** Units the kept courses already total. */
  keptUnits: number;
}

function reasonsFor(angle: Angle, ask: Ask, facts: PlanFacts, keep: string[]): ReasonCode[] {
  const out: ReasonCode[] = [];
  const { units } = ask.constraints;
  if (units.min != null || units.max != null) out.push("MEETS_UNITS");
  if (ask.constraints.earliestStart != null) out.push("STARTS_LATE");
  if (ask.constraints.latestEnd != null) out.push("ENDS_EARLY");
  if (ask.constraints.avoidDays.length) out.push("AVOIDS_DAYS");
  if (keep.length) out.push("KEEPS_LOCKED");
  if (angle === "fewer_days") out.push("FEWER_DAYS");
  if (angle === "fewer_gaps") out.push("FEWER_GAPS");
  if (angle === "requirements") out.push("MORE_REQUIREMENTS");
  void facts;
  return out;
}

/**
 * Drafts for a quarter: the courses to keep, plus new ones from the request
 * to land in the unit range, every piece fitted with real sections when the
 * term has them. "Improve" is the same search with the kept courses free to
 * change sections (their current pick preferred) and no new courses unless
 * the units ask for them.
 */
export async function buildPlanOptions(ctx: PlanningContext, ask: Ask, mode: "build" | "improve"): Promise<OptionsResult> {
  const target = ask.target;
  const keptCodes = ctx.plan.schedule.map((s) => s.code);
  const locked = new Set(ask.keep);
  if (target.kind === "plan") return planSlotOptions(ctx, ask);

  const needed = mode === "build" || (ask.constraints.units.min != null && ctx.plan.schedule.reduce((n, s) => n + s.units, 0) < ask.constraints.units.min);
  const pool = needed ? retrieveCandidates(ctx, ask, 30) : [];
  await ctx.data.load(subjectsOf([...keptCodes, ...pool.map((r) => r.k)], ctx.data).slice(0, 14));
  const st = standing(ctx);

  // New courses worth trying, each checked once; their sections are fitted per search.
  const candidates: { row: CourseRow; relevance: number }[] = [];
  for (const row of pool) {
    if (candidates.length >= 10) break;
    const checks = courseChecks(ctx, row, target, ask.goal);
    if (ask.goal && checks.some((c) => c.code === "REQ_EXCLUDED" || c.code === "REQ_NOT_LISTED")) continue;
    if (ask.constraints.noPrerequisites && !noPrereqConfirmed(checks)) continue;
    if (prereqCheck(checks)?.status === "fail") continue;
    if (!groupSections(ctx.data.detail(row.k)?.sec ?? []).length) continue;
    const prereq = prereqCheck(checks);
    candidates.push({ row, relevance: (ask.goal ? 3 : 0) + (prereq?.status === "pass" ? 2 : 0) + (row.sa != null && row.sa > 0 ? 1 : 0) });
  }

  /**
   * The search's courses under a set of constraints. A course on the
   * schedule always stays: locked ones exactly as they are; in a build, the
   * others keep their sections unless those break a constraint; in an
   * improve, any sections that keep the constraints, the current ones first.
   * A kept pick that breaks a hard constraint is never quietly kept — the
   * course then has no configuration, the search finds nothing, and the
   * answer names the constraint to loosen.
   */
  const makeCourses = (k: Constraints): SearchCourse[] => {
    const out: SearchCourse[] = [];
    for (const s of ctx.plan.schedule) {
      const sec = ctx.data.detail(s.code)?.sec ?? [];
      const current = st.fixed.find((f) => f.course === s.code);
      let configs: Config[];
      if (!groupSections(sec).length) configs = [unscheduledConfig(s.code)];
      else if (current && locked.has(s.code)) configs = keepsConstraints(current, k) ? [current] : [];
      else if (current && mode === "build" && keepsConstraints(current, k)) configs = [current];
      else {
        configs = configurations(s.code, sec, k);
        if (current && keepsConstraints(current, k) && !configs.some((c) => c.key === current.key)) configs.unshift(current);
      }
      out.push({ code: s.code, units: s.units, configs, required: true, current: current?.key, relevance: 0, requirement: false });
    }
    // Only configurations that fit around the courses with one way to go can be in any draft.
    const definite = out.filter((c) => c.configs.length === 1).map((c) => c.configs[0]);
    for (const { row, relevance } of candidates) {
      const configs = configurations(row.k, ctx.data.detail(row.k)?.sec ?? [], k)
        .filter((c) => !definite.some((f) => meetingsClash(c, f) || finalsClash(c, f)));
      if (configs.length) out.push({ code: row.k, units: countedUnits(row), configs, required: false, relevance, requirement: Boolean(ask.goal) });
    }
    return out;
  };

  const courses = makeCourses(ask.constraints);
  const considered = courses.filter((c) => !c.required).length;
  const result = search(courses, ask.constraints.units, ask.preferences);
  const picked = pickOptions(result.solutions, ask.preferences, courses);
  let outcome = result.outcome;
  if (!picked.length) outcome = { ...outcome, relaxation: findRelaxation(makeCourses, ask.constraints, ask.preferences) };

  const proposals = picked.map(({ solution, angle }) => {
    const ops: PlanOp[] = [];
    const adds: CourseCard[] = [];
    for (const c of solution.configs) {
      if (solution.added.includes(c.course)) {
        ops.push({ op: "add_term", code: c.course, selection: c.selection });
        const row = ctx.data.row(c.course)!;
        const checks = [
          ...courseChecks(ctx, row, target, ask.goal),
          ...placementChecks(c, solution.configs.filter((d) => d.course !== c.course), []),
          seatCheck(ctx, c),
        ];
        adds.push(cardFor(ctx, row, c, checks));
      } else if (c.selection) {
        const now = ctx.plan.selections[c.course] ?? null;
        if (!now || !sameSelection(now, c.selection)) ops.push({ op: "set_sections", code: c.course, selection: c.selection, expect: now });
      }
    }
    const keep = ctx.plan.schedule.map((s) => s.code).filter((c) => !ops.some((o) => o.code === c));
    return proposalFromOps(ctx, target, ops, adds, {
      title: ANGLE_TITLE[angle],
      reasons: reasonsFor(angle, ask, solution.facts, keep),
      keep,
      sources: ask.goal ? goalSources(ask.goal, ctx.data.ge) : [],
    });
  });
  return {
    proposals,
    outcome,
    undecided: st.undecided,
    considered,
    keptUnits: ctx.plan.schedule.reduce((n, s) => n + s.units, 0),
  };
}

/**
 * Drafts for a 4-year plan quarter, where no sections are published: courses
 * only, chosen to land in the unit range, best first by the request. Times
 * are not checked, and each card says so.
 */
async function planSlotOptions(ctx: PlanningContext, ask: Ask): Promise<OptionsResult> {
  const target = ask.target;
  if (target.kind !== "plan") throw new Error("planSlotOptions needs a plan target");
  const pool = retrieveCandidates(ctx, ask, 30);
  await ctx.data.load(subjectsOf(pool.map((r) => r.k), ctx.data).slice(0, 10));
  const inSlot = ctx.plan.planned.filter((p) => p.year === target.slot.year && p.quarter === target.slot.quarter);
  const have = inSlot.reduce((n, p) => n + p.course.units, 0);
  const min = ask.constraints.units.min ?? have;
  const max = ask.constraints.units.max ?? Math.max(min, have) + 8;
  const usable: { row: CourseRow; checks: Check[]; score: number }[] = [];
  for (const row of pool) {
    const checks = courseChecks(ctx, row, target, ask.goal);
    if (ask.goal && checks.some((c) => c.code === "REQ_EXCLUDED" || c.code === "REQ_NOT_LISTED")) continue;
    if (ask.constraints.noPrerequisites && !noPrereqConfirmed(checks)) continue;
    if (prereqCheck(checks)?.status === "fail") continue;
    const past = pastOfferings(ctx.data.detail(row.k), target.slot.quarter).length;
    usable.push({ row, checks, score: (ask.goal ? 3 : 0) + Math.min(past, 4) + (prereqCheck(checks)?.status === "pass" ? 2 : 0) });
    if (usable.length >= 12) break;
  }
  usable.sort((a, b) => b.score - a.score || a.row.k.localeCompare(b.row.k));

  const choose = (start: number): typeof usable => {
    const out: typeof usable = [];
    let units = have;
    for (const u of [...usable.slice(start), ...usable.slice(0, start)]) {
      const n = countedUnits(u.row);
      if (units >= min) break;
      if (units + n > max) continue;
      out.push(u);
      units += n;
    }
    return units >= min || !ask.constraints.units.min ? out : [];
  };
  const drafts: (typeof usable)[] = [];
  for (const start of [0, 1, 2]) {
    const d = choose(start);
    const key = d.map((u) => u.row.k).sort().join();
    if (d.length && !drafts.some((x) => x.map((u) => u.row.k).sort().join() === key)) drafts.push(d);
  }
  const titles = ["Draft", "Another mix", "A third mix"];
  const proposals = drafts.slice(0, 3).map((d, i) => proposalFromOps(
    ctx, target,
    d.map((u) => ({ op: "add_plan" as const, code: u.row.k, slot: target.slot })),
    d.map((u) => cardFor(ctx, u.row, null, u.checks)),
    { title: titles[i], reasons: ask.constraints.units.min != null ? ["MEETS_UNITS"] : [], sources: ask.goal ? goalSources(ask.goal, ctx.data.ge) : [] },
  ));
  return {
    proposals,
    outcome: { exhaustive: true, explored: usable.length, relaxation: null },
    undecided: [],
    considered: usable.length,
    keptUnits: have,
  };
}

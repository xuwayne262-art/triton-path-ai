import type { DayOfWeek } from "@/components/triton/types";
import type { SectionTuple } from "@/lib/plat";
import {
  CODE, DAYS, END, INSTRUCTOR, START, TYPE,
  groupSections, isWaitlistOnly, meetingsOfRows, meetingsOverlap, oneOffsFor, rowsFor, sameSelection,
  sectionSeats, sectionMeetings, selectedSections, typeLabel,
  type Meeting, type SectionSelection,
} from "@/lib/sections";
import { timeToMinutes } from "@/lib/plat";
import type { Constraints, PlanFacts, Preference, Relaxation, SearchOutcome } from "./types";

/**
 * Schedules from real sections, within a fixed budget.
 *
 * A course is a set of configurations: one lecture family's lecture rows,
 * one section of every sub-section type that family requires, and the
 * finals those sections carry — never a lecture alone when a discussion or
 * lab is required. Configurations that break a hard constraint are dropped
 * up front, and every pair across courses is checked once for a clash of
 * weekly meetings or of finals, so the search only ever combines
 * compatible pieces.
 *
 * The search is capped in configurations per course, subsets of new
 * courses, states visited and wall time. It says whether it looked at
 * everything or stopped at a cap, because "nothing fits" and "nothing found
 * yet" are different answers.
 */

export interface Exam {
  /** "2026-12-12" */
  date: string;
  startMin: number;
  endMin: number;
  /** "Final Exam" */
  label: string;
}

export interface Config {
  key: string;
  course: string;
  /** Null for a course with no published sections: it has no times to check. */
  selection: SectionSelection | null;
  meetings: Meeting[];
  finals: Exam[];
  /** A chosen section has no published time. */
  tba: boolean;
  /** Fewest open seats among the chosen sections, when every one is counted. */
  seatsOpen: number | null;
  /** A chosen section is full, or full and taking a waitlist. */
  full: boolean;
  waitlistOnly: boolean;
  instructor: string;
  /** "Lecture A00 · Discussion A03" */
  label: string;
  rows: SectionTuple[];
}

export const MAX_CONFIGS_PER_COURSE = 24;
const MAX_ENUMERATED = 400;

const dateOf = (s: SectionTuple) => (/^\d{4}-\d{2}-\d{2}$/.test(s[DAYS] ?? "") ? s[DAYS] : /^\d{4}-\d{2}-\d{2}$/.test(s[CODE]) ? s[CODE] : "");

/** The finals a set of chosen rows carries, from the course's dated rows. */
export function finalsFor(sec: SectionTuple[], chosen: SectionTuple[]): Exam[] {
  return oneOffsFor(sec, chosen)
    .filter((s) => s[TYPE] === "FI")
    .flatMap((s) => {
      const start = timeToMinutes(s[START]);
      const end = timeToMinutes(s[END]);
      const date = dateOf(s);
      return date && start != null && end != null ? [{ date, startMin: start, endMin: end, label: typeLabel(s[TYPE]) }] : [];
    });
}

function describe(rows: SectionTuple[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const r of rows) {
    const label = `${typeLabel(r[TYPE])} ${r[CODE]}`;
    if (!seen.has(label)) { seen.add(label); parts.push(label); }
  }
  return parts.join(" · ");
}

/** One configuration from a pick, or null when the pick names nothing this term has. */
export function configFor(code: string, sec: SectionTuple[], selection: SectionSelection): Config | null {
  const families = groupSections(sec);
  const rows = selectedSections(families, selection);
  if (!rows.length) return null;
  return toConfig(code, sec, selection, rows);
}

function toConfig(code: string, sec: SectionTuple[], selection: SectionSelection, rows: SectionTuple[]): Config {
  const seats = rows.map(sectionSeats);
  const known = seats.every((s) => s.known);
  return {
    key: `${code}|${selection.family}|${Object.keys(selection.parts).sort().map((k) => selection.parts[k]).join(",")}`,
    course: code,
    selection,
    meetings: meetingsOfRows(rows),
    finals: finalsFor(sec, rows),
    tba: rows.some((r) => !sectionMeetings(r).length),
    seatsOpen: known && seats.length ? Math.min(...seats.map((s) => s.open)) : null,
    full: seats.some((s) => s.known && s.full),
    waitlistOnly: rows.some(isWaitlistOnly),
    instructor: rows.find((r) => r[INSTRUCTOR])?.[INSTRUCTOR] ?? "",
    label: describe(rows),
    rows,
  };
}

/** A course with no sections to choose: on the plan, but with nothing to check its time against. */
export function unscheduledConfig(code: string): Config {
  return {
    key: `${code}|none`, course: code, selection: null, meetings: [], finals: [], tba: true,
    seatsOpen: null, full: false, waitlistOnly: false, instructor: "", label: "Sections not chosen", rows: [],
  };
}

/** Whether one configuration keeps a hard constraint. TBA rows cannot break a time rule, and are flagged instead. */
export function keepsConstraints(c: Config, k: Pick<Constraints, "earliestStart" | "latestEnd" | "avoidDays" | "openSeats">): boolean {
  for (const m of c.meetings) {
    if (k.earliestStart != null && m.startMin < k.earliestStart) return false;
    if (k.latestEnd != null && m.endMin > k.latestEnd) return false;
    if (k.avoidDays.includes(m.day)) return false;
  }
  if (k.openSeats && (c.full || c.waitlistOnly)) return false;
  return true;
}

/**
 * Every complete pick for a course that keeps the constraints, as
 * configurations: one per lecture family and choice of each required
 * sub-section. Two picks with the same meetings and finals are one for
 * scheduling, so only the roomier is kept. Capped, keeping a spread of days
 * and start times rather than the first few in UCSD's order.
 */
export function configurations(
  code: string,
  sec: SectionTuple[],
  k: Pick<Constraints, "earliestStart" | "latestEnd" | "avoidDays" | "openSeats">,
  cap = MAX_CONFIGS_PER_COURSE,
): Config[] {
  const out = new Map<string, Config>();
  let enumerated = 0;
  for (const family of groupSections(sec)) {
    const partOptions = family.parts.map((p) => p.sections.map((s) => ({ type: p.type, code: s[CODE], rows: rowsFor(p, s[CODE]) })));
    const pick = (i: number, parts: Record<string, string>, rows: SectionTuple[]) => {
      if (enumerated >= MAX_ENUMERATED) return;
      if (i === partOptions.length) {
        enumerated++;
        const selection = { family: family.key, parts: { ...parts } };
        const c = toConfig(code, sec, selection, rows);
        if (!keepsConstraints(c, k)) return;
        const sig = `${c.meetings.map((m) => `${m.day}${m.startMin}-${m.endMin}`).sort().join(",")}|${c.finals.map((f) => `${f.date}${f.startMin}`).join(",")}`;
        const had = out.get(sig);
        if (!had || (c.seatsOpen ?? -1) > (had.seatsOpen ?? -1)) out.set(sig, c);
        return;
      }
      for (const opt of partOptions[i]) {
        // A sub-section clashing with its own lecture can never be taken with it.
        const clash = meetingsOfRows(opt.rows).some((m) => meetingsOfRows(rows).some((r) => meetingsOverlap(m, r)));
        if (clash) continue;
        pick(i + 1, { ...parts, [opt.type]: opt.code }, [...rows, ...opt.rows]);
      }
    };
    pick(0, {}, [...family.lectureRows]);
  }
  return spread([...out.values()], cap);
}

/** At most `cap`, taken round-robin from groups of the same days and start hour. */
function spread(configs: Config[], cap: number): Config[] {
  if (configs.length <= cap) return configs;
  const groups = new Map<string, Config[]>();
  for (const c of configs) {
    const days = [...new Set(c.meetings.map((m) => m.day))].sort().join("");
    const hour = c.meetings.length ? Math.floor(Math.min(...c.meetings.map((m) => m.startMin)) / 60) : -1;
    const key = `${days}|${hour}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  for (const g of groups.values()) g.sort((a, b) => (b.seatsOpen ?? -1) - (a.seatsOpen ?? -1));
  const out: Config[] = [];
  const queues = [...groups.values()];
  for (let round = 0; out.length < cap; round++) {
    let took = false;
    for (const q of queues) {
      if (q[round] && out.length < cap) { out.push(q[round]); took = true; }
    }
    if (!took) break;
  }
  return out;
}

// ── Clashes ──────────────────────────────────────────────────────────────────

/** Weekly meetings of two configurations that overlap. */
export const meetingsClash = (a: Config, b: Config) =>
  a.meetings.some((m) => b.meetings.some((n) => meetingsOverlap(m, n)));

/** Finals on the same day at overlapping times. */
export const finalsClash = (a: Config, b: Config) =>
  a.finals.some((f) => b.finals.some((g) => f.date === g.date && f.startMin < g.endMin && g.startMin < f.endMin));

export interface Clash {
  a: string;
  b: string;
  kind: "meeting" | "final";
}

/** Every clash among a set of configurations, one per pair and kind. */
export function clashes(configs: Config[]): Clash[] {
  const out: Clash[] = [];
  for (let i = 0; i < configs.length; i++) {
    for (let j = i + 1; j < configs.length; j++) {
      const a = configs[i];
      const b = configs[j];
      if (a.course === b.course) continue;
      if (meetingsClash(a, b)) out.push({ a: a.course, b: b.course, kind: "meeting" });
      if (finalsClash(a, b)) out.push({ a: a.course, b: b.course, kind: "final" });
    }
  }
  return out;
}

// ── Facts about a week ───────────────────────────────────────────────────────

/** Units, days, first and last class, gaps and clashes for a set of configurations. */
export function factsOf(configs: Config[], units: Record<string, number>): PlanFacts {
  const meetings = configs.flatMap((c) => c.meetings);
  const days = (["Mon", "Tue", "Wed", "Thu", "Fri"] as DayOfWeek[]).filter((d) => meetings.some((m) => m.day === d));
  let gapMinutes = 0;
  for (const d of days) {
    const today = meetings.filter((m) => m.day === d).sort((a, b) => a.startMin - b.startMin);
    let end = today[0].endMin;
    for (const m of today.slice(1)) {
      if (m.startMin > end) gapMinutes += m.startMin - end;
      end = Math.max(end, m.endMin);
    }
  }
  return {
    units: configs.reduce((n, c) => n + (units[c.course] ?? 0), 0),
    courses: configs.length,
    days,
    earliest: meetings.length ? Math.min(...meetings.map((m) => m.startMin)) : null,
    latest: meetings.length ? Math.max(...meetings.map((m) => m.endMin)) : null,
    gapMinutes,
    conflicts: clashes(configs).length,
    unscheduled: configs.filter((c) => c.tba).map((c) => c.course),
  };
}

// ── The search ───────────────────────────────────────────────────────────────

export interface SearchCourse {
  code: string;
  units: number;
  configs: Config[];
  /** Kept: always in every draft, in one of its configurations. */
  required: boolean;
  /** The configuration the plan has now, preferred so a draft changes as little as it can. */
  current?: string;
  /** How well an optional course serves the request, higher first. */
  relevance: number;
  /** Counts toward the requirement asked about. */
  requirement: boolean;
}

export interface SearchSolution {
  configs: Config[];
  added: string[];
  facts: PlanFacts;
  /** Kept courses whose sections changed. */
  changed: string[];
  score: number;
}

export interface SearchCaps {
  maxStates: number;
  maxMs: number;
  maxSubsets: number;
  maxSolutions: number;
}

export const DEFAULT_CAPS: SearchCaps = { maxStates: 25_000, maxMs: 150, maxSubsets: 400, maxSolutions: 200 };

/** Soft scores, lower is better, from what the student asked to trade for. */
export function scoreOf(s: Omit<SearchSolution, "score">, prefs: Preference[], courses: Map<string, SearchCourse>): number {
  const w = {
    days: prefs.includes("fewer_days") ? 600 : 40,
    gaps: prefs.includes("fewer_gaps") ? 4 : 0.4,
    early: prefs.includes("later_start") ? 3 : 0.2,
    late: prefs.includes("earlier_finish") ? 3 : 0.1,
    req: prefs.includes("requirements") ? 400 : 120,
  };
  const f = s.facts;
  const relevance = s.added.reduce((n, c) => n + (courses.get(c)?.relevance ?? 0), 0);
  const requirement = s.added.filter((c) => courses.get(c)?.requirement).length;
  const risky = s.configs.filter((c) => c.full || c.waitlistOnly).length;
  return f.days.length * w.days
    + f.gapMinutes * w.gaps
    + (f.earliest != null ? (24 * 60 - f.earliest) * w.early : 0)
    + (f.latest ?? 0) * w.late
    + s.changed.length * 250
    + risky * 300
    - requirement * w.req
    - relevance * 10;
}

function* subsets<T>(items: T[], size: number, start = 0, prefix: T[] = []): Generator<T[]> {
  if (prefix.length === size) { yield prefix; return; }
  for (let i = start; i <= items.length - (size - prefix.length); i++) yield* subsets(items, size, i + 1, [...prefix, items[i]]);
}

export interface SearchResult {
  solutions: SearchSolution[];
  outcome: SearchOutcome;
}

/**
 * Finds drafts: every required course plus enough optional ones to land in
 * the unit range, each in a configuration that clashes with none of the
 * others. Returns the best by score (the student's preferences), and
 * whether the search covered everything within its caps.
 */
export function search(
  courses: SearchCourse[],
  units: { min: number | null; max: number | null },
  prefs: Preference[],
  caps: SearchCaps = DEFAULT_CAPS,
  now: () => number = () => Date.now(),
): SearchResult {
  const started = now();
  const byCode = new Map(courses.map((c) => [c.code, c]));
  const required = courses.filter((c) => c.required);
  const optional = courses.filter((c) => !c.required && c.configs.length).sort((a, b) => b.relevance - a.relevance);
  const base = required.reduce((n, c) => n + c.units, 0);
  const min = units.min ?? base;
  const max = units.max ?? Math.max(min, base) + 8;
  let states = 0;
  let capped = false;
  const found: SearchSolution[] = [];
  const seen = new Set<string>();

  const out = (): boolean => states >= caps.maxStates || now() - started > caps.maxMs || found.length >= caps.maxSolutions;

  const tryCourses = (set: SearchCourse[], added: string[]) => {
    // Fewest configurations first: the most constrained course fails fastest.
    const order = [...set].sort((a, b) => a.configs.length - b.configs.length);
    const chosen: Config[] = [];
    const walk = (i: number) => {
      if (out()) { capped = true; return; }
      if (i === order.length) {
        const facts = factsOf(chosen, Object.fromEntries(set.map((c) => [c.code, c.units])));
        const changed = order.filter((c, j) => c.required && c.current && chosen[j].key !== c.current).map((c) => c.code);
        const key = chosen.map((c) => c.key).sort().join(";");
        if (seen.has(key)) return;
        seen.add(key);
        const partial = { configs: [...chosen], added, facts, changed };
        found.push({ ...partial, score: scoreOf(partial, prefs, byCode) });
        return;
      }
      const course = order[i];
      // The current pick first, so an unchanged schedule is found before a reshuffle.
      const configs = course.current
        ? [...course.configs].sort((a, b) => Number(b.key === course.current) - Number(a.key === course.current))
        : course.configs;
      for (const c of configs) {
        states++;
        if (chosen.some((d) => meetingsClash(c, d) || finalsClash(c, d))) continue;
        chosen.push(c);
        walk(i + 1);
        chosen.pop();
        if (capped) return;
      }
    };
    walk(0);
  };

  if (base > max) {
    return { solutions: [], outcome: { exhaustive: true, explored: 0, relaxation: null } };
  }
  if (base >= min || !optional.length) {
    if (base >= min) tryCourses(required, []);
  }
  let tried = 0;
  for (let size = 1; size <= Math.min(4, optional.length) && !capped; size++) {
    for (const subset of subsets(optional, size)) {
      const total = base + subset.reduce((n, c) => n + c.units, 0);
      if (total < min || total > max) continue;
      if (++tried > caps.maxSubsets) { capped = true; break; }
      tryCourses([...required, ...subset], subset.map((c) => c.code));
      if (capped) break;
    }
  }
  found.sort((a, b) => a.score - b.score || a.added.join().localeCompare(b.added.join()));
  return { solutions: found, outcome: { exhaustive: !capped, explored: states, relaxation: null } };
}

/** Whether two drafts differ in a way a student would notice. */
export function meaningfullyDifferent(a: SearchSolution, b: SearchSolution): boolean {
  const sa = new Set(a.configs.map((c) => c.course));
  const sb = new Set(b.configs.map((c) => c.course));
  if (sa.size !== sb.size || [...sa].some((c) => !sb.has(c))) return true;
  if (a.facts.days.length !== b.facts.days.length) return true;
  if (Math.abs(a.facts.gapMinutes - b.facts.gapMinutes) >= 30) return true;
  if (a.facts.earliest != null && b.facts.earliest != null && Math.abs(a.facts.earliest - b.facts.earliest) >= 60) return true;
  return false;
}

export type Angle = "draft" | "fewer_days" | "fewer_gaps" | "later_start" | "requirements";

/**
 * One strong draft and up to two alternatives that differ in a way that
 * matters — fewer days on campus, shorter gaps, a later start, more toward
 * the requirement — each labelled with the angle it wins on. When every
 * solution is the same week, there is one draft and no alternatives.
 */
export function pickOptions(
  solutions: SearchSolution[],
  prefs: Preference[],
  courses: SearchCourse[],
): { solution: SearchSolution; angle: Angle }[] {
  if (!solutions.length) return [];
  const byCode = new Map(courses.map((c) => [c.code, c]));
  const draft = solutions[0];
  const picked: { solution: SearchSolution; angle: Angle }[] = [{ solution: draft, angle: "draft" }];
  const angles: [Angle, (s: SearchSolution) => number][] = [
    ["fewer_days", (s) => s.facts.days.length * 10_000 + s.facts.gapMinutes],
    ["fewer_gaps", (s) => s.facts.gapMinutes * 10 + s.facts.days.length],
    ["later_start", (s) => -(s.facts.earliest ?? 0)],
    ["requirements", (s) => -s.added.filter((c) => byCode.get(c)?.requirement).length * 1000 + s.score / 1000],
  ];
  for (const [angle, key] of angles) {
    if (picked.length >= 3) break;
    if (prefs.includes(angle as Preference)) continue; // the draft already leans this way
    const best = [...solutions].sort((a, b) => key(a) - key(b) || a.score - b.score)[0];
    const better = key(best) < key(draft);
    if (better && picked.every((p) => meaningfullyDifferent(p.solution, best))) picked.push({ solution: best, angle });
  }
  return picked;
}

/**
 * When nothing fits, the one constraint whose loosening by a step finds a
 * draft, tried in the order a student is likeliest to accept. Each try is a
 * smaller search. Locked courses are never loosened here: dropping one is
 * offered only as a choice the student makes.
 */
export function findRelaxation(
  rebuild: (k: Constraints) => SearchCourse[],
  constraints: Constraints,
  prefs: Preference[],
): Relaxation | null {
  const small: SearchCaps = { maxStates: 6_000, maxMs: 60, maxSubsets: 120, maxSolutions: 1 };
  const tries: [Relaxation, Constraints][] = [];
  if (constraints.earliestStart != null) {
    const to = constraints.earliestStart - 60;
    tries.push([{ kind: "earlier_start", to }, { ...constraints, earliestStart: to }]);
  }
  if (constraints.latestEnd != null) {
    const to = constraints.latestEnd + 60;
    tries.push([{ kind: "later_end", to }, { ...constraints, latestEnd: to }]);
  }
  for (const day of constraints.avoidDays) {
    tries.push([{ kind: "allow_day", day }, { ...constraints, avoidDays: constraints.avoidDays.filter((d) => d !== day) }]);
  }
  if (constraints.openSeats) tries.push([{ kind: "allow_full" }, { ...constraints, openSeats: false }]);
  if (constraints.units.min != null && constraints.units.min > 4) {
    const to = constraints.units.min - 4;
    tries.push([{ kind: "fewer_units", to }, { ...constraints, units: { ...constraints.units, min: to } }]);
  }
  for (const [relaxation, k] of tries) {
    if (search(rebuild(k), k.units, prefs, small).solutions.length) return relaxation;
  }
  return null;
}

/** Whether a configuration is the pick a course already has. */
export const isCurrent = (c: Config, sel: SectionSelection | undefined) => Boolean(c.selection && sameSelection(c.selection, sel));

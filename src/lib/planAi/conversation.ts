import type { DayOfWeek } from "@/components/triton/types";
import { collegeName, termName } from "@/lib/plat";
import type { Goal } from "./requirements";
import type { Ask } from "./engine";
import type {
  Constraints, CourseCard, Interpretation, PlanTarget, Preference, Proposal, Relaxation, RequirementRef, UnitRange,
} from "./types";
import { shortClock } from "./vocabulary";
import { DISCIPLINE_NAMES, programById } from "./warren";
import { list } from "./explain";

/**
 * The conversation's memory and the rules for carrying it from turn to turn.
 *
 * What the student has said stays said: a unit range, a start time, a
 * requirement, a course to keep. Each turn's reading is folded into these
 * settings, which the page shows as chips the student can edit, so a
 * follow-up like "try a later start" refines the last request instead of
 * starting over. Nothing here touches the plan; it only decides what to ask
 * the engine for.
 */

export interface Settings {
  target: PlanTarget;
  /** The quarter's unit target, for building and filling. */
  units: UnitRange;
  earliestStart: number | null;
  latestEnd: number | null;
  avoidDays: DayOfWeek[];
  openSeats: boolean;
  noPrerequisites: boolean;
  prereqsMet: boolean;
  preferences: Preference[];
  /** The requirement goal, as asked; resolved against the student each time. */
  goal: RequirementRef | null;
  /** Courses to keep exactly as they are. */
  keep: string[];
  /** Departments to draw from. */
  subjects: string[];
  topic: string | null;
}

/** A quarter's usual load for a full-time student: the default unit target, shown as one. */
export const DEFAULT_UNITS: UnitRange = { min: 12, max: 16 };

export function defaultSettings(target: PlanTarget): Settings {
  return {
    target, units: { ...DEFAULT_UNITS }, earliestStart: null, latestEnd: null, avoidDays: [],
    openSeats: false, noPrerequisites: false, prereqsMet: false, preferences: [], goal: null, keep: [],
    subjects: [], topic: null,
  };
}

/**
 * Folds one reading into the settings. A constraint the student states
 * replaces the old one; preferences and kept courses accumulate. Returns
 * the new settings and, in words, what changed — said back so nothing the
 * student asked for is applied silently.
 */
export function absorb(settings: Settings, p: Interpretation, target: PlanTarget | null): { settings: Settings; changed: string[] } {
  const next: Settings = { ...settings, preferences: [...settings.preferences], keep: [...settings.keep] };
  const changed: string[] = [];
  const k = p.constraints;
  if (target && (target.kind !== settings.target.kind || target.label !== settings.target.label)) {
    next.target = target;
    changed.push(target.label);
  }
  if (k.units && (k.units.min != null || k.units.max != null)) {
    next.units = { min: k.units.min, max: k.units.max };
    changed.push(unitsLabel(next.units));
  }
  if (k.earliestStart != null) { next.earliestStart = k.earliestStart; changed.push(`nothing before ${shortClock(k.earliestStart)}`); }
  if (k.latestEnd != null) { next.latestEnd = k.latestEnd; changed.push(`done by ${shortClock(k.latestEnd)}`); }
  if (k.avoidDays?.length) {
    next.avoidDays = [...new Set([...next.avoidDays, ...k.avoidDays])];
    changed.push(`no classes on ${list(k.avoidDays)}`);
  }
  if (k.openSeats) { next.openSeats = true; changed.push("open seats only"); }
  if (k.noPrerequisites) { next.noPrerequisites = true; changed.push("no prerequisites"); }
  if (k.prereqsMet) { next.prereqsMet = true; changed.push("prerequisites you meet"); }
  for (const pref of p.preferences) {
    if (!next.preferences.includes(pref)) { next.preferences.push(pref); changed.push(PREFERENCE_LABEL[pref].toLowerCase()); }
  }
  if (p.requirement) next.goal = p.requirement;
  if (p.subjects.length) next.subjects = p.subjects;
  if (p.topic) next.topic = p.topic;
  for (const code of p.keep) if (!next.keep.includes(code)) { next.keep.push(code); changed.push(`keep ${code}`); }
  return { settings: next, changed };
}

export const PREFERENCE_LABEL: Record<Preference, string> = {
  fewer_days: "Fewer campus days",
  fewer_gaps: "Shorter gaps",
  later_start: "Later start",
  earlier_finish: "Earlier finish",
  requirements: "More requirement progress",
  different_instructor: "Different instructor",
  open_seats: "Open seats",
};

export function unitsLabel(u: UnitRange): string {
  if (u.min != null && u.max != null) return u.min === u.max ? `${u.min} units` : `${u.min}–${u.max} units`;
  if (u.min != null) return `${u.min}+ units`;
  if (u.max != null) return `up to ${u.max} units`;
  return "Any units";
}

export function timeLabel(s: Pick<Settings, "earliestStart" | "latestEnd" | "avoidDays">): string {
  const parts: string[] = [];
  if (s.earliestStart != null) parts.push(`After ${shortClock(s.earliestStart)}`);
  if (s.latestEnd != null) parts.push(`Done by ${shortClock(s.latestEnd)}`);
  if (s.avoidDays.length) parts.push(`No ${s.avoidDays.join("/")}`);
  return parts.join(" · ") || "Any time";
}

/** A requirement reference in a few words, before it is resolved. */
export function goalRefLabel(ref: RequirementRef | null): string {
  if (!ref) return "No requirement";
  switch (ref.kind) {
    case "warren_pofc":
    case "warren_area_study": {
      const unit = ref.kind === "warren_area_study" ? "Area Study" : "PofC";
      const program = programById(ref.program);
      if (program) return `Warren ${unit} · ${program.name}`;
      return ref.discipline ? `Warren ${unit} · ${DISCIPLINE_NAMES[ref.discipline]}` : `Warren ${unit}`;
    }
    case "college_ge":
      return ref.area ? `${collegeName(ref.area.split(":")[0])} GE · ${ref.area.slice(ref.area.indexOf(":") + 1)}` : ref.college ? `${collegeName(ref.college)} GE requirements` : "A GE";
    case "university":
      return ref.list === "campus:DEI" ? "DEI requirement" : "AHI requirement";
    case "major":
      return "Major courses";
  }
}

/** The engine's request from the settings, with the goal already resolved. */
export function askFrom(s: Settings, goal: Goal | null, courses: string[] = []): Ask {
  const constraints: Constraints = {
    units: s.units,
    earliestStart: s.earliestStart,
    latestEnd: s.latestEnd,
    avoidDays: s.avoidDays,
    noPrerequisites: s.noPrerequisites,
    prereqsMet: s.prereqsMet,
    openSeats: s.openSeats,
  };
  return { target: s.target, constraints, preferences: s.preferences, goal, subjects: s.subjects, courses, keep: s.keep, topic: s.topic };
}

/** Applies a relaxation the student chose. */
export function relax(s: Settings, r: Relaxation): Settings {
  switch (r.kind) {
    case "earlier_start": return { ...s, earliestStart: r.to };
    case "later_end": return { ...s, latestEnd: r.to };
    case "allow_day": return { ...s, avoidDays: s.avoidDays.filter((d) => d !== r.day) };
    case "fewer_units": return { ...s, units: { ...s.units, min: r.to } };
    case "allow_full": return { ...s, openSeats: false };
    case "drop_keep": return { ...s, keep: s.keep.filter((c) => c !== r.code) };
  }
}

/**
 * Which displayed item "the second one", "option 2", "that one" or "the last
 * one" means. 0 is "this one": only clear when one item is shown.
 */
export function resolveRef<T>(ref: number, shown: T[]): { item: T; index: number } | { problem: "none" | "ambiguous" | "out-of-range" } {
  if (!shown.length) return { problem: "none" };
  if (ref === 0) return shown.length === 1 ? { item: shown[0], index: 0 } : { problem: "ambiguous" };
  const index = ref === -1 ? shown.length - 1 : ref - 1;
  return index >= 0 && index < shown.length ? { item: shown[index], index } : { problem: "out-of-range" };
}

/** True when a proposal was built on a plan that has since changed. */
export const isStale = (p: Pick<Proposal, "base">, fingerprint: string) => p.base !== fingerprint;

/** Whether applying a proposal would clear most of an existing plan: that needs one confirmation. */
export function replacesPlan(p: Proposal): boolean {
  return p.removes.length >= 2 && p.removes.length >= Math.ceil(p.before.courses / 2);
}

/** What a target is called in a sentence. */
export function targetWords(t: PlanTarget): string {
  if (t.kind === "term") return termName(t.term);
  return t.term ? `${termName(t.term)} (Year ${t.slot.year})` : `Year ${t.slot.year} ${t.slot.quarter}`;
}

/** Courses a card list or a set of options name, for "these two courses". */
export function codesIn(items: (CourseCard | Proposal)[]): string[] {
  return [...new Set(items.flatMap((x) => ("ops" in x ? x.adds.map((a) => a.code) : [x.code])))];
}

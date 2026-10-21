import type { DayOfWeek } from "@/components/triton/types";
import type { PlanOp, PlanSlot } from "@/lib/plan/change";
import type { SectionSelection } from "@/lib/sections";
import type { WarrenDiscipline } from "./warren";

/**
 * Plan with AI's types, kept in four separate stages so none is mistaken for
 * another:
 *
 *  1. an Interpretation — what the student asked for, read by the local
 *     parser or the model; nothing in it is trusted yet;
 *  2. evidence — course rows, sections and records the app itself loaded;
 *  3. a Proposal — concrete operations on the plan, checked against that
 *     evidence, with every check's outcome and source;
 *  4. a saved change — what the server applied (lib/plan/change.ts).
 *
 * The model only ever produces the first. Everything after it is computed
 * here from UCSDPlans' own data.
 */

export type IntentKind =
  | "build_quarter"
  | "find_fitting_course"
  | "improve_plan"
  | "compare_options"
  | "explain_choice"
  | "add_course"
  | "remove_course"
  | "replace_course"
  | "move_course"
  | "undo"
  | "clarify";

/** Things a student can ask to trade for, scored softly. */
export type Preference =
  | "fewer_days"
  | "fewer_gaps"
  | "later_start"
  | "earlier_finish"
  | "requirements"
  | "different_instructor"
  | "open_seats";

/** A quarter as the student named it, resolved against the term registry later. */
export interface QuarterRef {
  relative: "this" | "next" | null;
  season: "Fall" | "Winter" | "Spring" | null;
  /** Calendar year, 2027. */
  year: number | null;
  /** 4-year plan year, 1–4. */
  planYear: 1 | 2 | 3 | 4 | null;
}

export type RequirementRef =
  | { kind: "warren_pofc"; discipline: WarrenDiscipline | null; program: string | null }
  | { kind: "warren_area_study"; discipline: WarrenDiscipline | null; program: string | null }
  | { kind: "college_ge"; college: string | null; area: string | null; words: string | null }
  | { kind: "university"; list: "campus:DEI" | "campus:AHI" }
  | { kind: "major" };

export interface UnitRange {
  min: number | null;
  max: number | null;
}

/** Hard constraints: a draft that breaks one is never offered. */
export interface Constraints {
  units: UnitRange;
  /** Minutes past midnight; no meeting may start before it. */
  earliestStart: number | null;
  /** No meeting may end after it. */
  latestEnd: number | null;
  avoidDays: DayOfWeek[];
  /** Only courses with UCSD's statement that there are no prerequisites. */
  noPrerequisites: boolean;
  /** Only courses whose prerequisites the saved Academic History meets. */
  prereqsMet: boolean;
  /** Only sections with an open seat in the last count. */
  openSeats: boolean;
}

export const NO_CONSTRAINTS: Constraints = {
  units: { min: null, max: null },
  earliestStart: null,
  latestEnd: null,
  avoidDays: [],
  noPrerequisites: false,
  prereqsMet: false,
  openSeats: false,
};

export interface Interpretation {
  kind: IntentKind | null;
  /** Courses named, canonical codes the catalog has. */
  courses: string[];
  /** Codes that looked like courses but the catalog does not have. */
  unknownCodes: string[];
  /** For replace: the course to bring in. */
  replacement: string | null;
  /** 1-based, into the options on screen. */
  optionRef: number | null;
  quarter: QuarterRef | null;
  constraints: Partial<Omit<Constraints, "units">> & { units?: UnitRange };
  preferences: Preference[];
  requirement: RequirementRef | null;
  subjects: string[];
  /** A title word to look for; never a requirement word. */
  topic: string | null;
  /** Courses to keep as they are. */
  keep: string[];
  /** "keep my current courses". */
  keepAll: boolean;
  /** A clarification the request needs before anything else, like "make it easier". */
  ask: "easier" | "these-courses" | null;
  /** Read by the local parser, an explicit instruction: may be carried out at once. */
  explicit: boolean;
  /** Confirming or declining whatever is waiting for an answer. */
  reply: "yes" | "no" | null;
  /** Words the parser could not place. Never dropped silently: they are named back to the student. */
  leftover: string[];
  /** Parts the model said it could not apply. */
  unsupported: string[];
  source: "local" | "model";
}

// ── Evidence and checks ──────────────────────────────────────────────────────

/** How much a claim can be relied on, shown with every check. */
export type Basis =
  /** UCSD's own published record (schedule, catalog, official list). */
  | "official"
  /** A rule a college publishes, applied by UCSDPlans to its data. */
  | "rule"
  /** A list compiled by students, which may be incomplete. */
  | "community"
  /** The student's own saved Academic History. */
  | "record";

export type CheckStatus = "pass" | "fail" | "unknown";

export type CheckCode =
  // Schedule
  | "NO_CONFLICT" | "TIME_CONFLICT" | "FINAL_CONFLICT" | "FINAL_UNKNOWN" | "TIME_TBA"
  | "SECTIONS_UNPUBLISHED" | "SECTIONS_INCOMPLETE" | "NOT_OFFERED" | "OUTSIDE_HOURS" | "ON_AVOIDED_DAY"
  // Prerequisites
  | "PREREQ_NONE_STATED" | "PREREQ_NONE_LISTED" | "PREREQ_MET" | "PREREQ_PLANNED" | "PREREQ_MISSING"
  | "PREREQ_UNREADABLE" | "PREREQ_NO_RECORD" | "PREREQ_NOT_IN_CATALOG" | "PREREQ_CONSENT" | "RESTRICTED"
  // Requirements
  | "REQ_OFFICIAL_LIST" | "REQ_COMMUNITY_LIST" | "REQ_RULE" | "REQ_EXCLUDED" | "REQ_NOT_LISTED"
  // Seats
  | "SEATS_OPEN" | "SEATS_FULL" | "WAITLIST_ONLY" | "SEATS_UNKNOWN"
  // Units
  | "UNITS_IN_RANGE" | "UNITS_OUT_OF_RANGE" | "UNITS_VARIABLE";

export interface Check {
  status: CheckStatus;
  code: CheckCode;
  basis: Basis;
  /** The course it is about, when it is about one. */
  course?: string;
  /** Values the explanation template fills in. */
  detail?: Record<string, string | number>;
}

/** Where a claim came from, and when that source was read. */
export interface SourceRef {
  id: string;
  label: string;
  url?: string;
  /** ISO date or instant. */
  asOf?: string | null;
}

// ── What is shown ────────────────────────────────────────────────────────────

export interface MeetingLine {
  /** "Lecture A00" */
  label: string;
  /** "TuTh 11:00a–12:20p" */
  when: string;
  where: string;
}

/** One course as a card: what it is, its sections, why it fits and what to watch. */
export interface CourseCard {
  code: string;
  title: string;
  /** As the catalog states them: "4", "1-4". */
  units: string;
  /** The planner's count for the totals. */
  unitsCounted: number;
  selection: SectionSelection | null;
  meetings: MeetingLine[];
  final: string | null;
  instructor: string | null;
  /** The one specific reason it fits, as a check code with its values. */
  reason: Check | null;
  /** The material caveat, if any. */
  caveat: Check | null;
  checks: Check[];
  /** Historical average GPA and its terms, a separate signal from ratings. */
  grades: { gpa: number; terms: number } | null;
  /** RateMyProfessors quality for this term's instructor, with its count. */
  rating: { quality: number; count: number } | null;
}

/** Facts about a schedule, before or after a change. */
export interface PlanFacts {
  units: number;
  courses: number;
  days: DayOfWeek[];
  earliest: number | null;
  latest: number | null;
  /** Minutes between consecutive classes on the same day, summed over the week. */
  gapMinutes: number;
  conflicts: number;
  /** Courses whose times could not be checked. */
  unscheduled: string[];
}

export type ReasonCode =
  | "MEETS_UNITS" | "STARTS_LATE" | "ENDS_EARLY" | "FEWER_DAYS" | "FEWER_GAPS" | "MORE_REQUIREMENTS"
  | "KEEPS_LOCKED" | "AVOIDS_DAYS" | "ONLY_COMBINATION";

/** Where a change goes: this term's schedule, or one quarter of the 4-year plan. */
export type PlanTarget =
  | { kind: "term"; term: string; label: string }
  | { kind: "plan"; slot: PlanSlot; label: string; term: string | null };

export interface Proposal {
  /** Stable while it is shown; references like "the second one" resolve to it. */
  id: string;
  target: PlanTarget;
  /** The plan's fingerprint (lib/plan/patch.ts) it was built on: once the plan moves, it is stale. */
  base: string;
  /** "Draft", "Fewer campus days", … */
  title: string;
  ops: PlanOp[];
  /** Courses kept as they are. */
  keep: string[];
  /** Courses added, removed and resectioned, for the diff. */
  adds: CourseCard[];
  removes: string[];
  resections: string[];
  before: PlanFacts;
  after: PlanFacts;
  checks: Check[];
  reasons: ReasonCode[];
  sources: SourceRef[];
}

/** Why a search for drafts found none, so the answer can say which. */
export interface SearchOutcome {
  /** Every combination within the caps was tried. */
  exhaustive: boolean;
  explored: number;
  /** The constraint that, relaxed by one step, finds a draft; null when none does. */
  relaxation: Relaxation | null;
}

export type Relaxation =
  | { kind: "earlier_start"; to: number }
  | { kind: "later_end"; to: number }
  | { kind: "allow_day"; day: DayOfWeek }
  | { kind: "fewer_units"; to: number }
  | { kind: "allow_full" }
  | { kind: "drop_keep"; code: string };

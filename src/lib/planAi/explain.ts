import { dayLabel } from "@/lib/plat";
import { seatDay } from "@/lib/freshness";
import type { DayOfWeek } from "@/components/triton/types";
import type { Basis, Check, CheckStatus, PlanFacts, Proposal, ReasonCode, Relaxation } from "./types";
import { clockLabel, shortClock } from "./vocabulary";

/**
 * Every sentence Plan with AI says about a plan, from templates.
 *
 * Checks and reasons are codes with values; this turns them into short,
 * plain sentences. No model writes these: an explanation that a model
 * composed could say more than the check found. Claims carry their basis in
 * words — UCSD's own record, a college's rule, a student-compiled list, the
 * student's saved record — so how far to trust one is never left implicit.
 */

const DAY_NAMES: Record<DayOfWeek, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday" };

const s = (v: string | number | undefined) => (v == null ? "" : String(v));

/** "2026-10-17T22:27Z" -> "Oct 17"; a date stays a date. */
function when(at: string | number | undefined): string {
  const v = s(at);
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return dayLabel(v, { weekday: false });
  return Number.isFinite(Date.parse(v)) ? seatDay(v) : v;
}

const EXCLUDED: Record<string, string> = {
  MGT_EXCLUDED: "Rady School of Management (MGT) courses can't count toward a PofC.",
  SPECIAL_STUDIES: "Special Studies (195) courses can't count toward a PofC.",
  NOT_FOUR_UNITS: "PofC courses must be four-unit courses.",
  OTHER_DEPARTMENT: "It isn't one of the program's department courses.",
};

/** One check as one sentence. */
export function checkText(c: Check): string {
  const d = c.detail ?? {};
  switch (c.code) {
    case "NO_CONFLICT": return Number(d.against) ? "Fits around your other classes, finals included." : "Nothing else on your week to clash with.";
    case "TIME_CONFLICT": return `Clashes with ${s(d.with)}.`;
    case "FINAL_CONFLICT": return `Its final overlaps ${s(d.with)}'s final.`;
    case "FINAL_UNKNOWN": return "No final time published, so finals weren't checked.";
    case "TIME_TBA": return "Some meeting times are TBA, so they weren't checked.";
    case "SECTIONS_UNPUBLISHED": {
      const past = s(d.past);
      return `Schedule not published for ${s(d.quarter)}, so times aren't checked.${past ? ` Taught in ${past.split(", ").map((t) => termWords(t)).join(" and ")}.` : " Not taught in that season in the grade archive."}`;
    }
    case "SECTIONS_INCOMPLETE": return `Not checked against ${s(d.courses)}, which has no sections chosen yet.`;
    case "NOT_OFFERED": return "Not on this term's schedule.";
    case "OUTSIDE_HOURS": return "Meets outside the hours you asked for.";
    case "ON_AVOIDED_DAY": return "Meets on a day you asked to keep free.";
    case "PREREQ_NONE_STATED": return "UCSD's catalog says it has no prerequisites.";
    case "PREREQ_NONE_LISTED": return "No prerequisites listed by UCSD.";
    case "PREREQ_MET": return `Your Academic History shows ${s(d.courses)}.`;
    case "PREREQ_PLANNED": return `Depends on finishing ${s(d.courses)} first.`;
    case "PREREQ_MISSING": return `Not in your Academic History: ${s(d.missing)}.`;
    case "PREREQ_UNREADABLE": return d.text ? `Prerequisites need a manual check: "${s(d.text)}"` : "Prerequisites need a manual check.";
    case "PREREQ_NO_RECORD": return "Prerequisites not checked: no saved Academic History.";
    case "PREREQ_NOT_IN_CATALOG": return "Not in the current catalog, so its prerequisites are unknown.";
    case "PREREQ_CONSENT": return d.missing ? `Needs consent unless you've taken ${s(d.missing)}.` : "Needs instructor or department consent.";
    case "RESTRICTED": return `Restrictions apply: "${s(d.text)}"`;
    case "REQ_OFFICIAL_LIST": return `On UCSD's ${s(d.list)} list${d.asOf ? `, checked ${when(d.asOf)}` : ""}.`;
    case "REQ_COMMUNITY_LIST": return `May count for ${s(d.college)} ${s(d.area)}. From a student-compiled list that may be incomplete.`;
    case "REQ_RULE": return d.unit
      ? `Can count toward ${article(s(d.program))} ${s(d.program)} ${s(d.unit)} under Warren's rule. Warren doesn't list the courses, so confirm with Warren Advising.`
      : `A course in ${s(d.program).toLowerCase()}.`;
    case "REQ_EXCLUDED": return EXCLUDED[s(d.reason)] ?? "Doesn't count toward that program.";
    case "REQ_NOT_LISTED": return `Not on the ${s(d.list || d.college)} list.`;
    case "SEATS_OPEN": return `${s(d.open)} ${Number(d.open) === 1 ? "seat" : "seats"} open${d.asOf ? ` as of ${when(d.asOf)}` : ""}. Not live.`;
    case "SEATS_FULL": return `Full${d.asOf ? ` as of ${when(d.asOf)}` : ""}.`;
    case "WAITLIST_ONLY": return `Full and taking a waitlist${d.asOf ? ` as of ${when(d.asOf)}` : ""}.`;
    case "SEATS_UNKNOWN": return "Seat count not published.";
    case "UNITS_IN_RANGE": return "Within your unit range.";
    case "UNITS_OUT_OF_RANGE": return "Outside your unit range.";
    case "UNITS_VARIABLE": return `Variable units (${s(d.units)}). Counted at the low end.`;
  }
}

/** "a" or "an", by how the next word sounds as far as its first letter tells. */
const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

/** "WI26" -> "Winter 2026". */
function termWords(term: string): string {
  const seasons: Record<string, string> = { FA: "Fall", WI: "Winter", SP: "Spring" };
  return seasons[term.slice(0, 2)] ? `${seasons[term.slice(0, 2)]} 20${term.slice(2)}` : term;
}

/** How a status reads without colour. */
export const STATUS_WORD: Record<CheckStatus, string> = {
  pass: "Checked",
  fail: "Problem",
  unknown: "Not checked",
};

/** Whose word a claim rests on. */
export const BASIS_WORD: Record<Basis, string> = {
  official: "UCSD data",
  rule: "Warren College rule",
  community: "Student-compiled list",
  record: "Your Academic History",
};

/**
 * Whether a check may wear a plain green mark. Only a pass resting on UCSD's
 * own record or the student's own does; a rule applied by UCSDPlans, a
 * community list, and anything unknown never look verified.
 */
export const verified = (c: Check) => c.status === "pass" && (c.basis === "official" || c.basis === "record");

/** One reason a draft was built the way it was. */
export function reasonText(code: ReasonCode, p: Proposal, ctx: { units?: { min: number | null; max: number | null }; earliest?: number | null; latest?: number | null; avoid?: DayOfWeek[]; goal?: string }): string {
  switch (code) {
    case "MEETS_UNITS": {
      const { min, max } = ctx.units ?? { min: null, max: null };
      const range = min != null && max != null ? `${min}–${max}` : min != null ? `at least ${min}` : max != null ? `at most ${max}` : "";
      return `${p.after.units} units${range ? `, within ${range}` : ""}.`;
    }
    case "STARTS_LATE": return ctx.earliest != null ? `Nothing starts before ${shortClock(ctx.earliest)}.` : "Starts later.";
    case "ENDS_EARLY": return ctx.latest != null ? `Everything ends by ${shortClock(ctx.latest)}.` : "Ends earlier.";
    case "AVOIDS_DAYS": return `No classes on ${list((ctx.avoid ?? []).map((d) => DAY_NAMES[d]))}.`;
    case "FEWER_DAYS": return `On campus ${p.after.days.length} ${p.after.days.length === 1 ? "day" : "days"} a week.`;
    case "FEWER_GAPS": return `${minutes(p.after.gapMinutes)} of gaps between classes a week.`;
    case "MORE_REQUIREMENTS": return `More courses toward ${ctx.goal ?? "your requirement"}.`;
    case "KEEPS_LOCKED": return p.keep.length ? `Keeps ${list(p.keep)} as ${p.keep.length === 1 ? "it is" : "they are"}.` : "Keeps your courses.";
    case "ONLY_COMBINATION": return "The only combination that fits.";
  }
}

export function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** 95 -> "1 hr 35 min". */
export function minutes(n: number): string {
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** "Mon–Thu" style list of days, or "No classes scheduled". */
export function daysText(days: DayOfWeek[]): string {
  return days.length ? days.join(", ") : "No timed classes";
}

/** First and last class in words. */
export function spanText(f: PlanFacts): string {
  return f.earliest != null && f.latest != null ? `${clockLabel(f.earliest)} to ${clockLabel(f.latest)}` : "No times yet";
}

/** The tradeoffs between a draft and the plan as it is, at most two. */
export function tradeoffs(p: Proposal): string[] {
  const out: string[] = [];
  const b = p.before;
  const a = p.after;
  if (a.days.length !== b.days.length && b.days.length) out.push(a.days.length < b.days.length ? `${b.days.length - a.days.length} fewer campus ${b.days.length - a.days.length === 1 ? "day" : "days"}` : `${a.days.length - b.days.length} more campus ${a.days.length - b.days.length === 1 ? "day" : "days"}`);
  if (Math.abs(a.gapMinutes - b.gapMinutes) >= 20 && b.courses) out.push(a.gapMinutes < b.gapMinutes ? `${minutes(b.gapMinutes - a.gapMinutes)} less waiting between classes` : `${minutes(a.gapMinutes - b.gapMinutes)} more waiting between classes`);
  if (a.earliest != null && b.earliest != null && a.earliest !== b.earliest) out.push(a.earliest > b.earliest ? `First class later, at ${clockLabel(a.earliest)}` : `First class earlier, at ${clockLabel(a.earliest)}`);
  return out.slice(0, 2);
}

/** A relaxation offered as the one change that would make a draft possible. */
export function relaxationText(r: Relaxation): { text: string; action: string } {
  switch (r.kind) {
    case "earlier_start": return { text: `Allowing classes from ${shortClock(r.to)} finds a draft.`, action: `Allow ${shortClock(r.to)} starts` };
    case "later_end": return { text: `Allowing classes until ${shortClock(r.to)} finds a draft.`, action: `Allow until ${shortClock(r.to)}` };
    case "allow_day": return { text: `Allowing classes on ${DAY_NAMES[r.day]} finds a draft.`, action: `Allow ${DAY_NAMES[r.day]}` };
    case "fewer_units": return { text: `Aiming for ${r.to} units instead finds a draft.`, action: `Try ${r.to}+ units` };
    case "allow_full": return { text: "Including full sections finds a draft. You'd be on a waitlist.", action: "Include full sections" };
    case "drop_keep": return { text: `Letting ${r.code} change finds a draft.`, action: `Let ${r.code} change` };
  }
}

/** The plan's facts as the summary lines, in words. */
export function factsLines(f: PlanFacts): string[] {
  const lines = [`${f.units} units · ${f.courses} ${f.courses === 1 ? "course" : "courses"}`];
  if (f.days.length) lines.push(`${f.days.length} ${f.days.length === 1 ? "day" : "days"} · ${spanText(f)}`);
  if (f.conflicts) lines.push(`${f.conflicts} ${f.conflicts === 1 ? "clash" : "clashes"}`);
  if (f.unscheduled.length) lines.push(`Times not checked: ${list(f.unscheduled)}`);
  return lines;
}

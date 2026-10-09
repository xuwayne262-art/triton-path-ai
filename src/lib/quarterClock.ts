/**
 * How far through the quarter UC San Diego is, to the second.
 *
 * "The quarter" is the Registrar's own: from the calendar's "Quarter begins"
 * day to its "Quarter ends" day, both whole days, on San Diego's clock. Every
 * boundary is the instant San Diego's clocks read midnight, so the answer is
 * the same for a student in La Jolla and one at home in Shanghai, fifteen
 * hours ahead — and Fall's change from daylight to standard time, which
 * makes that quarter an hour longer than its 83 days, is counted, not
 * guessed at.
 *
 * Summer is not a quarter on that calendar, so between Spring's last final
 * and Fall the clock counts down to Fall instead.
 */

import { QUARTERS, dayValue, todayInSanDiego, type Quarter } from "@/lib/housing/terms";

const SAN_DIEGO = "America/Los_Angeles";
const DAY_MS = 86_400_000;

/** San Diego's wall clock, read field by field. h23 so midnight is 00, never 24. */
const WALL = new Intl.DateTimeFormat("en-US", {
  timeZone: SAN_DIEGO,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

/** How far San Diego's clock is from UTC at an instant: −7h in daylight time, −8h in standard. */
function offsetAt(instant: number): number {
  const p: Record<string, number> = {};
  for (const part of WALL.formatToParts(instant)) p[part.type] = Number(part.value);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant San Diego's clocks read 00:00 on a date. Read the offset once
 * near the answer and once at it, so a date the clocks change on still lands
 * on the right hour (the changes happen at 2 a.m., never at midnight).
 */
export function sanDiegoMidnight(iso: string): number {
  const utcMidnight = dayValue(iso);
  if (!Number.isFinite(utcMidnight)) return Number.NaN;
  const first = utcMidnight - offsetAt(utcMidnight);
  return utcMidnight - offsetAt(first);
}

/** The date after `iso`, as YYYY-MM-DD. */
const nextDay = (iso: string) => new Date(dayValue(iso) + DAY_MS).toISOString().slice(0, 10);

/** The quarter's first instant and the instant after its last day ends. */
export function quarterSpan(q: Quarter): { start: number; end: number } {
  return { start: sanDiegoMidnight(q.begins), end: sanDiegoMidnight(nextDay(q.end)) };
}

/** The Registrar's quarters, without Summer, which that calendar does not call one. */
const CLOCK_QUARTERS = QUARTERS.filter((q) => !q.key.startsWith("SU"));

/**
 * The quarter the clock shows at an instant: the one under way, or between
 * quarters the next to begin. Null once the calendar runs out.
 */
export function clockQuarter(now: number): { quarter: Quarter; started: boolean } | null {
  for (const quarter of CLOCK_QUARTERS) {
    const { start, end } = quarterSpan(quarter);
    if (now < start) return { quarter, started: false };
    if (now < end) return { quarter, started: true };
  }
  return null;
}

/** Monday of the week a date falls in, as a UTC day value. */
const mondayOf = (iso: string) => {
  const t = dayValue(iso);
  return t - ((new Date(t).getUTCDay() + 6) % 7) * DAY_MS;
};

/** Where a day sits in the quarter's teaching: before it, a numbered week, or finals. */
export type Stage =
  | { kind: "before-instruction" }
  | { kind: "week"; week: number; of: number }
  | { kind: "finals" };

/**
 * UCSD counts teaching weeks from Monday. When instruction begins midweek, as
 * it does every Fall on a Thursday, those first days are Week 0, so the last
 * day of instruction is the Friday of Week 10 in every quarter.
 */
export function stageOn(q: Quarter, today: string): Stage | null {
  if (!q.lastClass) return null;
  if (today < q.classes) return { kind: "before-instruction" };
  if (today > q.lastClass) return { kind: "finals" };
  const startsMonday = new Date(dayValue(q.classes)).getUTCDay() === 1;
  const week = Math.round((mondayOf(today) - mondayOf(q.classes)) / (7 * DAY_MS)) + (startsMonday ? 1 : 0);
  const of = Math.round((mondayOf(q.lastClass) - mondayOf(q.classes)) / (7 * DAY_MS)) + (startsMonday ? 1 : 0);
  return { kind: "week", week, of };
}

/** The Monday each numbered week of instruction starts on, Week 1 to the last. */
export function weekStarts(q: Quarter): string[] {
  if (!q.lastClass) return [];
  const startsMonday = new Date(dayValue(q.classes)).getUTCDay() === 1;
  const first = mondayOf(q.classes) + (startsMonday ? 0 : 7 * DAY_MS);
  const out: string[] = [];
  for (let t = first; t <= mondayOf(q.lastClass); t += 7 * DAY_MS) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export type MilestoneKind = "begins" | "instruction" | "holiday" | "last-class" | "finals" | "ends";

/** A day or run of days the calendar names, in date order. */
export interface Milestone {
  kind: MilestoneKind;
  label: string;
  /** YYYY-MM-DD, inclusive. */
  from: string;
  to: string;
}

/** The quarter's named days, from "Quarter begins" to "Quarter ends". */
export function milestones(q: Quarter): Milestone[] {
  const season = q.name.split(" ")[0];
  const out: Milestone[] = [];
  if (q.classes === q.begins) {
    out.push({ kind: "begins", label: `${season} Quarter and instruction begin`, from: q.begins, to: q.begins });
  } else {
    out.push({ kind: "begins", label: `${season} Quarter begins`, from: q.begins, to: q.begins });
    out.push({ kind: "instruction", label: "Instruction begins", from: q.classes, to: q.classes });
  }
  // Consecutive days of one holiday read as one: "Thanksgiving Holiday, Nov 26–27".
  for (const [day, label] of Object.entries(q.holidayNames ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const last = out[out.length - 1];
    if (last.kind === "holiday" && last.label === label && nextDay(last.to) === day) last.to = day;
    else out.push({ kind: "holiday", label, from: day, to: day });
  }
  if (q.lastClass) {
    out.push({ kind: "last-class", label: "Instruction ends", from: q.lastClass, to: q.lastClass });
    out.push({ kind: "finals", label: "Final exams", from: nextDay(q.lastClass), to: q.end });
  }
  out.push({ kind: "ends", label: `${season} Quarter ends`, from: q.end, to: q.end });
  return out.sort((a, b) => a.from.localeCompare(b.from));
}

export interface ClockReading {
  quarter: Quarter;
  /** False between quarters, counting down to this one. */
  started: boolean;
  start: number;
  end: number;
  /** Share of the quarter gone by, 0–1. */
  fraction: number;
  /** Milliseconds since the quarter began; 0 before it has. */
  elapsed: number;
  /** Milliseconds until it ends — or, before it starts, until it begins. */
  remaining: number;
  /** San Diego's date at this instant. */
  today: string;
  stage: Stage | null;
  milestones: Milestone[];
  /** The next named day still ahead, or under way today. */
  next: Milestone | null;
}

/** Everything the clock shows, at one instant. */
export function readClock(now: number): ClockReading | null {
  const at = clockQuarter(now);
  if (!at) return null;
  const { quarter, started } = at;
  const { start, end } = quarterSpan(quarter);
  const today = todayInSanDiego(new Date(now));
  const all = milestones(quarter);
  return {
    quarter,
    started,
    start,
    end,
    fraction: started ? Math.min(1, Math.max(0, (now - start) / (end - start))) : 0,
    elapsed: started ? now - start : 0,
    remaining: started ? end - now : start - now,
    today,
    stage: started ? stageOn(quarter, today) : null,
    milestones: all,
    next: all.find((m) => m.to >= today) ?? null,
  };
}

/** Whole days, hours, minutes and seconds in a span of milliseconds, rounded down. */
export function splitDuration(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3_600),
    minutes: Math.floor((total % 3_600) / 60),
    seconds: total % 60,
  };
}

/** Where a date sits along the quarter, 0–1, at the start of that San Diego day. */
export function positionOf(iso: string, start: number, end: number): number {
  return Math.min(1, Math.max(0, (sanDiegoMidnight(iso) - start) / (end - start)));
}

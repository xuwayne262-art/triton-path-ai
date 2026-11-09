/**
 * A quarter's enrollment and academic dates, as UCSD's calendars publish them.
 *
 * Winter 2027's come from the Registrar's 2026–27 enrollment calendar, the
 * academic calendar on blink.ucsd.edu and, for the fee deadline the
 * enrollment calendar still lists as TBD, UCSD's 2026–27 fee pages
 * (src/data/calendar/WI27.json; each source says when it was checked). Every
 * date is a San Diego calendar date and stays one: an event that publishes no
 * time is never given one, so "Nov 9" is Nov 9 for a student reading it in
 * Shanghai too. A date UCSD has not published yet is kept, as awaiting
 * confirmation, rather than guessed.
 *
 * Every view of the dates (what is next, the dates grouped, the counts) is
 * derived from one list: the student-facing events for the audience chosen.
 * The headline used to skip ahead to a booking date and ignore the audience
 * buttons, so on Jan 3 it announced Jan 15 over the start of classes.
 *
 * Fall 2026's three enrollment passes predate this file and are kept for
 * Fall only (its seat-history chart marks them); Winter has no passes of its
 * own: booking opens on each student's appointment, which only TSS shows.
 */

import WI27 from "@/data/calendar/WI27.json" with { type: "json" };
import { dayValue, type Quarter } from "@/lib/housing/terms";
import { sanDiegoMidnight, stageOn } from "@/lib/quarterClock";
import { TSS_PORTAL_URL } from "@/lib/links";

export type EventCategory = "booking" | "registration" | "academic" | "fees";

export type Group = "undergraduate" | "graduate";

/** What one source said about an event's date, and when that was checked. */
export interface EventSource {
  url: string;
  title: string;
  /** As the source writes it: "12/18/2026", "TBD". */
  says: string;
  /** YYYY-MM-DD this was last read. */
  checked: string;
}

export interface TimelineEvent {
  id: string;
  term: string;
  label: string;
  /** Who it applies to, in UCSD's words: "Continuing students", "Undergraduates", "Office". */
  audience: string;
  /** Who it applies to, as data. Preferred over reading `audience`, whose words can be ambiguous. */
  groups?: Group[];
  category: EventCategory;
  /** YYYY-MM-DD in San Diego, or null while UCSD has not published it. */
  date: string | null;
  /** The last day of a run of days ("Final exams"), inclusive. */
  end_date: string | null;
  status: "published" | "unpublished";
  source_url: string;
  /** Where sources disagree or more than one stands behind the date, each one. */
  sources?: EventSource[];
  /** A condition or a disagreement between sources, shown with the date. */
  note?: string;
}

/** One calendar the dates come from: when UCSD last updated it, and when it was checked here. */
export interface CalendarSource {
  url: string;
  title: string;
  updated: string | null;
  checked: string;
}

export interface TermTimeline {
  term: string;
  label: string;
  timezone: string;
  /** When the dates were last checked against their sources. */
  as_of: string;
  /** The last day enrollment changes are made in TSS; its link is offered until then. */
  enrollment_ends?: string;
  deadline_note: string;
  sources?: CalendarSource[];
  events: TimelineEvent[];
}

const TIMELINES: Record<string, TermTimeline> = { WI27: WI27 as TermTimeline };

export const timelineFor = (term: string | null | undefined): TermTimeline | null => (term ? TIMELINES[term] ?? null : null);

/**
 * Where a student's own booking appointment is: UCSD's enrollment system, by
 * the login address UCSD publishes. TSS's bare root answers 503.
 */
export const TSS_URL = TSS_PORTAL_URL;

/** Dates for offices and programs, not something a student acts on. */
export const forStudents = (e: TimelineEvent) => !/^(office|graduate programs)$/i.test(e.audience.trim());

/**
 * Who an event covers, for the undergraduate and graduate choices: its
 * `groups` when the data says, else UCSD's wording. UCSD names one group
 * ("Undergraduates", "Graduate students", "Master's students") or everyone in
 * some situation ("Students with a hold"), which covers both.
 */
export function audienceOf(e: TimelineEvent): { undergraduate: boolean; graduate: boolean } {
  if (e.groups?.length) return { undergraduate: e.groups.includes("undergraduate"), graduate: e.groups.includes("graduate") };
  const a = e.audience.trim().toLowerCase();
  if (/^undergraduate and graduate/.test(a)) return { undergraduate: true, graduate: true };
  if (/^(returning |new |continuing )?undergraduates?\b/.test(a)) return { undergraduate: true, graduate: false };
  if (/^(graduate students|graduate programs|master|doctoral)/.test(a)) return { undergraduate: false, graduate: true };
  return { undergraduate: true, graduate: true };
}

export type AudienceFilter = "all" | "undergraduate" | "graduate";

export const AUDIENCES: { value: AudienceFilter; label: string }[] = [
  { value: "all", label: "All students" },
  { value: "undergraduate", label: "Undergraduates" },
  { value: "graduate", label: "Graduate students" },
];

export const isAudience = (v: unknown): v is AudienceFilter => v === "all" || v === "undergraduate" || v === "graduate";

export const matchesAudience = (e: TimelineEvent, filter: AudienceFilter) =>
  filter === "all" || audienceOf(e)[filter];

/**
 * The line under an event naming who it is for, or null when the choice
 * above already says it: "All students" needs no line, nor "Undergraduates"
 * while only undergraduate dates are shown. A situation ("Students with a
 * hold") is always said.
 */
export function audienceLine(e: TimelineEvent, filter: AudienceFilter): string | null {
  const a = e.audience.trim();
  if (/^(all students|undergraduate and graduate students)$/i.test(a)) return null;
  if (filter === "undergraduate" && /^undergraduates?$/i.test(a)) return null;
  if (filter === "graduate" && /^graduate students$/i.test(a)) return null;
  return a;
}

const DAY_MS = 86_400_000;

/** Whole San Diego calendar days from `today` to `date`; negative once it has passed. */
export const daysUntil = (date: string, today: string) => Math.round((dayValue(date) - dayValue(today)) / DAY_MS);

/** The event's dates in date order, then those still to be published. */
export function chronological(t: TermTimeline): TimelineEvent[] {
  const dated = t.events.filter((e) => e.date).sort((a, b) => a.date!.localeCompare(b.date!) || a.id.localeCompare(b.id));
  return [...dated, ...t.events.filter((e) => !e.date)];
}

/** The one list every view is made from: the students' dates for one audience, in order. */
export const datesFor = (t: TermTimeline, filter: AudienceFilter = "all"): TimelineEvent[] =>
  chronological(t).filter((e) => forStudents(e) && matchesAudience(e, filter));

/** One calendar date and everything on it (a run of days sits under its first day). */
export interface DateGroup {
  date: string;
  events: TimelineEvent[];
}

/** Each date once, in order, with its events under it in the order given. */
export function groupByDate(events: TimelineEvent[]): DateGroup[] {
  const out: DateGroup[] = [];
  for (const e of events) {
    if (!e.date) continue;
    const last = out[out.length - 1];
    if (last && last.date === e.date) last.events.push(e);
    else out.push({ date: e.date, events: [e] });
  }
  return out;
}

/** "2027-01" -> its dates, for month headings; groups keep their order. */
export function byMonth(groups: DateGroup[]): { month: string; groups: DateGroup[] }[] {
  const out: { month: string; groups: DateGroup[] }[] = [];
  for (const g of groups) {
    const month = g.date.slice(0, 7);
    const last = out[out.length - 1];
    if (last && last.month === month) last.groups.push(g);
    else out.push({ month, groups: [g] });
  }
  return out;
}

/** "2027-01" -> "January 2027". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export interface TimelineView {
  /** Runs of days under way today ("Final exams"): a status, kept apart from what is due. */
  ongoing: TimelineEvent[];
  /** Dates today or ahead, each date once; today's, if any, first. */
  upcoming: DateGroup[];
  /** Dates gone by, in order. Passed means the date is over, not that anything was done. */
  past: DateGroup[];
  /** Dates UCSD has not published yet. */
  pending: TimelineEvent[];
}

/** The students' dates for one audience on one San Diego day, sorted into what each view shows. */
export function timelineView(t: TermTimeline, today: string, filter: AudienceFilter = "all"): TimelineView {
  const ongoing: TimelineEvent[] = [];
  const ahead: TimelineEvent[] = [];
  const gone: TimelineEvent[] = [];
  const pending: TimelineEvent[] = [];
  for (const e of datesFor(t, filter)) {
    if (!e.date) pending.push(e);
    else if ((e.end_date ?? e.date) < today) gone.push(e);
    else if (e.end_date && e.date <= today) ongoing.push(e);
    else ahead.push(e);
  }
  return { ongoing, upcoming: groupByDate(ahead), past: groupByDate(gone), pending };
}

/** "today", "tomorrow", "in 3 days": always beside the date, never instead of it. */
export function countdownWords(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/** Where a quarter is on a San Diego day, from its published boundaries. */
export type QuarterStage =
  | { kind: "before"; classes: string }
  | { kind: "teaching"; week: number; of: number }
  | { kind: "finals"; from: string; to: string }
  | { kind: "ended"; end: string };

/**
 * The quarter's stage. The end is checked first: stageOn calls every day
 * after the last class "finals", which would leave a finished quarter in
 * finals week forever.
 */
export function quarterStage(q: Quarter, today: string): QuarterStage | null {
  if (!q.lastClass) return null;
  if (today > q.end) return { kind: "ended", end: q.end };
  const s = stageOn(q, today);
  if (!s) return null;
  if (s.kind === "before-instruction") return { kind: "before", classes: q.classes };
  if (s.kind === "finals") {
    const from = new Date(dayValue(q.lastClass) + DAY_MS).toISOString().slice(0, 10);
    return { kind: "finals", from, to: q.end };
  }
  return { kind: "teaching", week: s.week, of: s.of };
}

/** Whether TSS is still where the next step is: until the last day to add. */
export const enrolling = (t: TermTimeline, today: string): boolean =>
  !t.enrollment_ends || today <= t.enrollment_ends;

/**
 * Dates to mark on a quarter's seat-history chart: when booking opened and
 * when waitlists did. Placed at the start of the San Diego day, since UCSD
 * gives the date and not a time; Fall's passes were published with times.
 */
export function chartMarks(term: string): { label: string; date: Date }[] {
  if (term === "FA26") return FALL_2026_PASSES;
  const t = timelineFor(term);
  if (!t) return [];
  const short: Record<string, string> = { "WI27-06": "Booking", "WI27-07": "Waitlists" };
  return t.events
    .filter((e) => e.date && short[e.id])
    .map((e) => ({ label: short[e.id], date: new Date(sanDiegoMidnight(e.date!)) }));
}

/** Fall 2026's three enrollment passes, 8 a.m. Pacific, as UCSD published them. Fall's own; never reused. */
export const FALL_2026_PASSES: { label: string; date: Date }[] = [
  { label: "Pass 1", date: new Date("2026-07-22T08:00:00-07:00") },
  { label: "Pass 2", date: new Date("2026-08-17T08:00:00-07:00") },
  { label: "Pass 3", date: new Date("2026-09-12T08:00:00-07:00") },
];

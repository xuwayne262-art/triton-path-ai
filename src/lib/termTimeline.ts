/**
 * A quarter's enrollment and academic dates, as UCSD's calendars publish them.
 *
 * Winter 2027's come from the Registrar's 2026–27 enrollment calendar and the
 * academic calendar on blink.ucsd.edu (src/data/calendar/WI27.json, checked
 * Nov 6, 2026). Every date is a San Diego calendar date and stays one: an
 * event that publishes no time is never given one, so "Nov 9" is Nov 9 for a
 * student reading it in Shanghai too. A date UCSD has not published yet is
 * kept, as TBD, rather than guessed.
 *
 * Fall 2026's three enrollment passes predate this file and are kept for
 * Fall only (its seat-history chart marks them); Winter has no passes of its
 * own — booking opens on each student's appointment, which only TSS shows.
 */

import WI27 from "@/data/calendar/WI27.json" with { type: "json" };
import { dayValue, todayInSanDiego } from "@/lib/housing/terms";
import { sanDiegoMidnight } from "@/lib/quarterClock";

export type EventCategory = "booking" | "registration" | "academic" | "fees";

export interface TimelineEvent {
  id: string;
  term: string;
  label: string;
  /** Who it applies to, in UCSD's words: "Continuing students", "Undergraduates", "Office". */
  audience: string;
  category: EventCategory;
  /** YYYY-MM-DD in San Diego, or null while UCSD has not published it. */
  date: string | null;
  /** The last day of a run of days ("Final exams"), inclusive. */
  end_date: string | null;
  status: "published" | "unpublished";
  source_url: string;
}

export interface TermTimeline {
  term: string;
  label: string;
  timezone: string;
  as_of: string;
  deadline_note: string;
  events: TimelineEvent[];
}

const TIMELINES: Record<string, TermTimeline> = { WI27: WI27 as TermTimeline };

export const timelineFor = (term: string | null | undefined): TermTimeline | null => (term ? TIMELINES[term] ?? null : null);

/** Where a student's own booking appointment is: UCSD's enrollment system. */
export const TSS_URL = "https://tss.ucsd.edu";

/** Dates for offices and programs, not something a student acts on. */
export const forStudents = (e: TimelineEvent) => !/^(office|graduate programs)$/i.test(e.audience.trim());

/**
 * Who an event's audience covers, for the undergraduate and graduate filters.
 * UCSD names one group ("Undergraduates", "Graduate students", "Master's
 * students") or everyone in some situation ("Students with a hold"), which
 * covers both.
 */
export function audienceOf(e: TimelineEvent): { undergraduate: boolean; graduate: boolean } {
  const a = e.audience.trim().toLowerCase();
  if (/^undergraduate and graduate/.test(a)) return { undergraduate: true, graduate: true };
  if (/^(returning |new |continuing )?undergraduates?\b/.test(a)) return { undergraduate: true, graduate: false };
  if (/^(graduate students|graduate programs|master|doctoral)/.test(a)) return { undergraduate: false, graduate: true };
  return { undergraduate: true, graduate: true };
}

export type AudienceFilter = "all" | "undergraduate" | "graduate";

export const matchesAudience = (e: TimelineEvent, filter: AudienceFilter) =>
  filter === "all" || audienceOf(e)[filter];

const DAY_MS = 86_400_000;

/** Whole San Diego calendar days from `today` to `date`; negative once it has passed. */
export const daysUntil = (date: string, today: string) => Math.round((dayValue(date) - dayValue(today)) / DAY_MS);

/** The event's dates in date order, then those still to be published. */
export function chronological(t: TermTimeline): TimelineEvent[] {
  const dated = t.events.filter((e) => e.date).sort((a, b) => a.date!.localeCompare(b.date!) || a.id.localeCompare(b.id));
  return [...dated, ...t.events.filter((e) => !e.date)];
}

export interface NextEvent {
  event: TimelineEvent;
  /** Days until it, 0 when it is today or under way. */
  days: number;
  /** A run of days ("Final exams") that has begun and not ended. */
  ongoing: boolean;
  /** Everything else on the same day, so "Jan 15" is read as one deadline day. */
  alongside: TimelineEvent[];
}

/**
 * The next date a student can act on: today's or the first still ahead. Null
 * once the quarter's dates are all past. `only` narrows it to some kinds, as
 * the headline does to booking while booking dates remain.
 */
export function nextEvent(
  t: TermTimeline, today: string = todayInSanDiego(), filter: AudienceFilter = "all", only?: EventCategory[],
): NextEvent | null {
  const ahead = chronological(t)
    .filter((e) => e.date && forStudents(e) && matchesAudience(e, filter) && (!only || only.includes(e.category)))
    .filter((e) => (e.end_date ?? e.date)! >= today);
  const first = ahead[0];
  if (!first) return null;
  const ongoing = first.date! < today;
  return {
    event: first,
    days: ongoing ? 0 : daysUntil(first.date!, today),
    ongoing,
    alongside: ahead.slice(1).filter((e) => e.date === first.date),
  };
}

/** The headline date: the next booking milestone while one is ahead, then the next of anything. */
export const headlineEvent = (t: TermTimeline, today: string = todayInSanDiego(), filter: AudienceFilter = "all") =>
  nextEvent(t, today, filter, ["booking"]) ?? nextEvent(t, today, filter);

/** "today", "tomorrow", "in 3 days", "under way": always beside the date, never instead of it. */
export function countdownWords(n: NextEvent): string {
  if (n.ongoing) return "under way";
  if (n.days === 0) return "today";
  if (n.days === 1) return "tomorrow";
  return `in ${n.days} days`;
}

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

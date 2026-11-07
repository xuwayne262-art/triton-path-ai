/**
 * The home page's academic calendar: the quarter under way (or just ended)
 * as a progress bar, and the next quarter's enrollment dates, in one panel.
 *
 * It shows both whichever quarter is being browsed. The quarter picker
 * decides which schedule search, course lists and the Planner show; this
 * panel is about where the calendar is, so switching the picker never
 * changes it, and each of its links names its own quarter explicitly.
 *
 * Everything here is plain data, so it is tested without a browser
 * (academicTimeline.test.ts); the panel itself only draws it.
 */

import { dayLabel } from "@/lib/plat";
import { readQuarter, type QuarterReading } from "@/lib/quarterClock";
import { quarterByKey } from "@/lib/housing/terms";
import { termLabelFor, termsServed, withTerm } from "@/lib/terms";
import { timelineFor, type DateGroup, type TimelineView } from "@/lib/termTimeline";

/** Which quarter is the bar and which the dates. Either can be missing; never the same one twice. */
export interface PanelQuarters {
  /** "FA26": shown as progress, in progress or ended. */
  progress: string | null;
  /** "WI27": the newest quarter with published enrollment dates. */
  dates: string | null;
}

/**
 * The newest served quarter with a dates file is the dates part; the latest
 * other served quarter the calendar knows is the bar. Fall 2026 and Winter
 * 2027 today; when Spring arrives with its own dates, Winter becomes the bar.
 */
export function panelQuarters(
  served: string[] = termsServed().map((t) => t.code),
  hasDates: (term: string) => boolean = (term) => Boolean(timelineFor(term)),
): PanelQuarters {
  const dates = [...served].reverse().find(hasDates) ?? null;
  const others = served.filter((t) => t !== dates && quarterByKey(t));
  return { progress: others.length ? others[others.length - 1] : null, dates };
}

/** "Week 6 of 10", "Finals week", "Ended Sat, Dec 12, 2026", "Begins Mon, Jan 4": the bar's phase, from its own dates. */
export function progressPhase(r: QuarterReading): string {
  if (r.ended) return `Ended ${dayLabel(r.quarter.end, { year: true })}`;
  if (!r.started) return `Begins ${dayLabel(r.quarter.begins)}`;
  const s = r.stage;
  if (s?.kind === "week") return `Week ${s.week} of ${s.of}`;
  if (s?.kind === "finals") return "Finals week";
  return "Before instruction";
}

/** The bar's reading for a quarter at an instant; null for a quarter the calendar does not know. */
export const progressFor = (term: string, now: number): QuarterReading | null => readQuarter(term, now);

export interface QuarterLink {
  term: string;
  label: string;
  href: string;
}

/**
 * A part's own way into the Planner, for its own quarter. The page's main
 * button follows the quarter being browsed; these never do, so "Fall
 * schedule" opens Fall while Winter is being browsed, and the reverse.
 */
export function plannerLink(term: string, ahead: boolean): QuarterLink {
  const season = termLabelFor(term).split(" ")[0];
  return { term, label: ahead ? `${season} planner` : `${season} schedule`, href: withTerm("/planner", term) };
}

/** Upcoming dates in the compact panel, and the events named under each before "Show all". */
export const COMPACT_DATES = 2;
export const COMPACT_EVENTS = 2;

export interface CompactDates {
  groups: DateGroup[];
  /** Upcoming dates beyond those shown, for the "View all" label. */
  moreDates: number;
}

export function compactDates(view: TimelineView): CompactDates {
  return {
    groups: view.upcoming.slice(0, COMPACT_DATES),
    moreDates: Math.max(0, view.upcoming.length - COMPACT_DATES),
  };
}

/** Where a date sits in the full list, so "Show all" for it opens the details there. */
export function dateSection(view: TimelineView, date: string): "ongoing" | "upcoming" | "past" | null {
  if (view.ongoing.some((e) => e.date === date)) return "ongoing";
  if (view.upcoming.some((g) => g.date === date)) return "upcoming";
  if (view.past.some((g) => g.date === date)) return "past";
  return null;
}

/** The id of a date's heading in the details; `prefix` keeps two copies of the list apart. */
export const dateAnchorId = (prefix: string, date: string) => `${prefix}-date-${date}`;

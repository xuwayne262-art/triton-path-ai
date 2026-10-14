"use client";

import { Bike, CheckCircle2, CircleDashed, Footprints } from "lucide-react";
import {
  LIBRARY_WALK, MODES, clockLabel, earliestStart, formatDuration, trip, weekCommute,
  type Mode, type Trip, type WeekCommute,
} from "@/lib/housing/commute";
import { quartersFor } from "@/lib/housing/terms";
import type { LatLng } from "@/lib/campus";
import type { Building } from "@/lib/plat";
import type { CalEvent } from "@/lib/sections";
import type { DayOfWeek } from "@/components/triton/types";

/** Small pieces shared by the housing pages. */

export const DAY_SHORT: Record<DayOfWeek, string> = { Mon: "M", Tue: "Tu", Wed: "W", Thu: "Th", Fri: "F" };

export const ModeIcon = ({ mode, className }: { mode: Mode; className?: string }) =>
  mode === "bike" ? <Bike className={className} /> : <Footprints className={className} />;

/** What each choice does, since the unchosen one is easy to read as switched off. */
const MODE_HINT: Record<Mode, string> = {
  walk: "Time every trip on foot",
  bike: "Time every trip by bike, at an easy 15 km/h",
};

export function ModeToggle({ mode, onMode }: { mode: Mode; onMode: (m: Mode) => void }) {
  return (
    <div role="radiogroup" aria-label="How you get to class" className="inline-flex rounded-lg bg-gray-100 p-0.5 dark:bg-white/10">
      {(Object.keys(MODES) as Mode[]).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => onMode(m)}
          title={mode === m ? `${MODE_HINT[m]} (chosen)` : `${MODE_HINT[m]}. Click to switch.`}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
            mode === m
              ? "bg-white text-[#182B49] shadow-sm dark:bg-white/20 dark:text-white"
              : "text-gray-700 hover:bg-white/60 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
          }`}
        >
          <ModeIcon mode={m} className="h-3.5 w-3.5" />
          {MODES[m].label}
        </button>
      ))}
    </div>
  );
}

/** Which quarters a stay covers, fully or in part. */
export function CoverageChips({ from, to, className = "" }: { from: string; to: string; className?: string }) {
  const quarters = quartersFor(from, to);
  if (!quarters.length) return null;
  return (
    <span className={`inline-flex flex-wrap gap-1 ${className}`}>
      {quarters.map(({ quarter, coverage }) => (
        <span
          key={quarter.key}
          title={coverage === "full" ? `Covers all of ${quarter.name}, finals included` : `Covers part of ${quarter.name}`}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            coverage === "full"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
              : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
          }`}
        >
          {coverage === "full" ? <CheckCircle2 className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
          {quarter.name}
          {coverage === "partial" && " (part)"}
        </span>
      ))}
    </span>
  );
}

/**
 * What a home costs in time, against the student's schedule when there is
 * one, else against Library Walk.
 */
export type Measure =
  | { kind: "week"; week: WeekCommute; oneWay: number }
  | { kind: "campus"; trip: Trip; oneWay: number };

export function measureFrom(
  ll: LatLng,
  schedule: { events: CalEvent[]; buildings: Record<string, Building> } | null,
  mode: Mode,
): Measure {
  if (schedule) {
    const week = weekCommute(ll, schedule.events, schedule.buildings, mode);
    if (week.days.length) {
      const trips = week.days.map((d) => d.there.minutes);
      return { kind: "week", week, oneWay: trips.reduce((a, b) => a + b, 0) / trips.length };
    }
  }
  const t = trip(ll, LIBRARY_WALK, mode);
  return { kind: "campus", trip: t, oneWay: t.minutes };
}

/** Sorting key: the whole week when there is one, else the one trip. */
export const measureCost = (m: Measure) => (m.kind === "week" ? m.week.minutes : m.trip.minutes);

/** A walk this long is not how anyone would get there, so the ride is shown beside it. */
const LONG_WALK = 35;

/** The same trips cycled, from the distances already worked out for walking. */
function cycled(m: Measure): number {
  const ride = (meters: number) => Math.max(1, Math.ceil(meters / MODES.bike.mPerMin));
  if (m.kind === "campus") return ride(m.trip.meters);
  return m.week.days.reduce((n, d) => n + ride(d.there.meters) + ride(d.back.meters), 0);
}

/** Green, amber or red by the typical one-way trip — for scanning a list, not a verdict. */
export function toneFor(oneWay: number): string {
  if (oneWay <= 12) return "text-emerald-700 dark:text-emerald-300";
  if (oneWay <= 25) return "text-amber-700 dark:text-amber-300";
  return "text-rose-700 dark:text-rose-300";
}

/**
 * The commute for a card: one figure worth scanning a list for, and under it,
 * quieter, when that means leaving. Each day's trip is on the listing itself
 * (and in the tooltip here) rather than spelled out on every card.
 */
export function CommuteLine({ measure, mode }: { measure: Measure; mode: Mode }) {
  const longWalk = mode === "walk" && measure.oneWay > LONG_WALK;
  const figure = (text: string) => (
    <span className={`font-semibold tabular-nums ${toneFor(measure.oneWay)}`}>{text}</span>
  );

  let headline: React.ReactNode;
  let detail: string[];
  let title: string | undefined;
  if (measure.kind === "campus") {
    headline = <>About {figure(`${measure.trip.minutes} min`)} to Library Walk {MODES[mode].verb}</>;
    detail = longWalk ? [`${cycled(measure)} min by bike`] : [];
  } else {
    const { week } = measure;
    const early = earliestStart(week);
    headline = <>About {figure(formatDuration(week.minutes))} a week to your classes {MODES[mode].verb}</>;
    detail = [
      ...(early ? [`Leave by ${clockLabel(early.leaveBy)} on ${early.day}`] : []),
      ...(longWalk ? [`${formatDuration(cycled(measure))} by bike`] : []),
    ];
    title = week.days.map((d) => `${d.day}: ${d.there.minutes} min to ${d.first.event.code} in ${d.first.building.n}`).join("\n");
  }
  // Every figure here is an estimate from straight-line distance, not a route.
  title = [title, "Estimated from straight-line distance, not a mapped route."].filter(Boolean).join("\n\n");

  return (
    <div className="flex min-w-0 items-start gap-2 text-[13px] leading-snug" title={title}>
      <ModeIcon mode={mode} className="mt-px h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
      <div className="min-w-0">
        <p className="text-gray-700 dark:text-gray-200">{headline}</p>
        {detail.length > 0 && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{detail.join(" · ")}</p>}
      </div>
    </div>
  );
}

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
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
            mode === m
              ? "bg-white text-[#182B49] shadow-sm dark:bg-white/20 dark:text-white"
              : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
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

/** The commute in two lines, for a card. */
export function CommuteLine({ measure, mode }: { measure: Measure; mode: Mode }) {
  if (measure.kind === "campus") {
    return (
      <p className={`flex items-center gap-1.5 text-xs font-semibold ${toneFor(measure.oneWay)}`}>
        <ModeIcon mode={mode} className="h-3.5 w-3.5 shrink-0" />
        {measure.trip.minutes} min to Library Walk {MODES[mode].verb}
        {mode === "walk" && measure.oneWay > LONG_WALK && (
          <span className="font-medium text-gray-500 dark:text-gray-400">· {cycled(measure)} min by bike</span>
        )}
      </p>
    );
  }
  const { week } = measure;
  const early = earliestStart(week);
  return (
    <div>
      <p className={`flex flex-wrap items-center gap-x-1.5 text-xs font-semibold ${toneFor(measure.oneWay)}`}>
        <ModeIcon mode={mode} className="h-3.5 w-3.5 shrink-0" />
        {formatDuration(week.minutes)} a week to your classes {MODES[mode].verb}
        {mode === "walk" && measure.oneWay > LONG_WALK && (
          <span className="font-medium text-gray-500 dark:text-gray-400">· {formatDuration(cycled(measure))} by bike</span>
        )}
        {early && (
          <span className="font-medium text-gray-500 dark:text-gray-400">
            · leave {clockLabel(early.leaveBy)} {early.day}
          </span>
        )}
      </p>
      <p className="mt-1 flex flex-wrap gap-1">
        {week.days.map((d) => (
          <span
            key={d.day}
            title={`${d.day}: ${d.there.minutes} min to ${d.first.event.code} in ${d.first.building.n}`}
            className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-gray-600 dark:bg-white/10 dark:text-gray-300"
          >
            {DAY_SHORT[d.day]} {d.there.minutes}
          </span>
        ))}
      </p>
    </div>
  );
}

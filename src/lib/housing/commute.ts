/**
 * What living somewhere would do to your week.
 *
 * Every housing site answers "how far is it from campus". That is the wrong
 * question at UCSD, where campus is two miles across: a place ten minutes from
 * Pepper Canyon is twenty-five from Scripps, and it matters which one your 8am
 * is in. The planner already knows the rooms of the sections a student chose,
 * and buildings.json knows where each room is, so every place can be measured
 * against the student's actual week: the trip to the first class each day,
 * the trip home from the last one, and when to leave.
 *
 * Times are estimates from straight-line distance, calibrated the same way as
 * the walks between classes (see campus.ts), and they say so wherever they are
 * shown. A fixed pace is honest about what it is; a number that looks routed
 * but is not would be worse than none.
 */

import { DETOUR, WALK_M_PER_MIN, WEEKDAYS, haversineMeters, type LatLng } from "@/lib/campus";
import type { Building } from "@/lib/plat";
import type { CalEvent } from "@/lib/sections";
import type { DayOfWeek } from "@/components/triton/types";
import { QUARTER_WEEKS } from "./terms";

export type Mode = "walk" | "bike";

export const MODES: Record<Mode, { label: string; verb: string; mPerMin: number }> = {
  walk: { label: "Walk", verb: "on foot", mPerMin: WALK_M_PER_MIN },
  // 15 km/h: an unhurried pace that leaves room for UCSD's hills and a rack.
  bike: { label: "Bike", verb: "by bike", mPerMin: 250 },
};

export const isMode = (v: string): v is Mode => v === "walk" || v === "bike";

/**
 * Where a trip goes when there is no schedule to measure against: the middle
 * of Library Walk, the same point the campus map opens on.
 */
export const LIBRARY_WALK: LatLng = [32.8795, -117.2375];

export interface Trip {
  meters: number;
  minutes: number;
}

/** One way, estimated. Never under a minute: nothing is zero minutes away. */
export function trip(from: LatLng, to: LatLng, mode: Mode): Trip {
  const meters = Math.round(haversineMeters(from, to) * DETOUR);
  return { meters, minutes: Math.max(1, Math.ceil(meters / MODES[mode].mPerMin)) };
}

/** A class with a place on the map. */
export interface Anchor {
  event: CalEvent;
  building: Building;
}

export interface DayCommute {
  day: DayOfWeek;
  /** The earliest class that has a location — where the morning trip goes. */
  first: Anchor;
  /** The class that ends last — where the trip home starts. */
  last: Anchor;
  there: Trip;
  back: Trip;
  /** Minutes past midnight to set off and arrive as the first class starts. */
  leaveBy: number;
  /** Classes that day with no place on the map (TBA, remote, unmapped rooms). */
  unplaced: CalEvent[];
}

export interface WeekCommute {
  mode: Mode;
  /** Weekdays with at least one class that can be placed, Monday first. */
  days: DayCommute[];
  /** Weekdays with classes, none of which has a location. */
  unmapped: DayOfWeek[];
  /** One round trip per day on campus, summed over the week. */
  minutes: number;
  meters: number;
}

const byStart = (a: CalEvent, b: CalEvent) =>
  a.startMin - b.startMin || a.endMin - b.endMin || a.code.localeCompare(b.code);

/**
 * The week from one home: a round trip for each day with classes. A long gap
 * between classes is not assumed to be a trip home — some students go back,
 * most do not — so the figure is a floor, and is described as one trip a day.
 */
export function weekCommute(
  home: LatLng,
  events: CalEvent[],
  buildings: Record<string, Building>,
  mode: Mode,
): WeekCommute {
  const days: DayCommute[] = [];
  const unmapped: DayOfWeek[] = [];

  for (const day of WEEKDAYS) {
    const todays = events.filter((e) => e.day === day && !e.ghost).sort(byStart);
    if (!todays.length) continue;

    const placed = todays.filter((e) => e.buildingCode && buildings[e.buildingCode]);
    if (!placed.length) {
      unmapped.push(day);
      continue;
    }

    const first = placed[0];
    const last = placed.reduce((a, b) => (b.endMin > a.endMin ? b : a));
    const firstAt = buildings[first.buildingCode];
    const lastAt = buildings[last.buildingCode];
    const there = trip(home, firstAt.ll, mode);
    const back = trip(lastAt.ll, home, mode);

    days.push({
      day,
      first: { event: first, building: firstAt },
      last: { event: last, building: lastAt },
      there,
      back,
      leaveBy: first.startMin - there.minutes,
      unplaced: todays.filter((e) => !placed.includes(e)),
    });
  }

  let minutes = 0;
  let meters = 0;
  for (const d of days) {
    minutes += d.there.minutes + d.back.minutes;
    meters += d.there.meters + d.back.meters;
  }
  return { mode, days, unmapped, minutes, meters };
}

/** The quarter's worth of a week's commuting, in minutes. */
export const perQuarter = (week: WeekCommute) => week.minutes * QUARTER_WEEKS;

/** The day that asks the most of this home: the earliest departure. */
export function earliestStart(week: WeekCommute): DayCommute | null {
  let best: DayCommute | null = null;
  for (const d of week.days) if (!best || d.leaveBy < best.leaveBy) best = d;
  return best;
}

/** "45 min", "2 h", "3 h 20 min" */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** "31 h" for a quarter's total — minutes stop meaning much past a day. */
export function formatHours(minutes: number): string {
  const h = minutes / 60;
  if (h < 1) return formatDuration(minutes);
  return `${h < 10 ? Math.round(h * 10) / 10 : Math.round(h)} h`;
}

/** 458 -> "7:38a", the compact spelling the rest of the planner uses. */
export function clockLabel(min: number): string {
  const wrapped = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = String(wrapped % 60).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${m}${h >= 12 ? "p" : "a"}`;
}

/**
 * Google Maps directions from a home to a class, in the mode Google does best
 * that we cannot: transit, with real timetables. Opened in a new tab.
 */
export function transitUrl(from: LatLng, to: LatLng): string {
  const p = new URLSearchParams({
    api: "1",
    origin: `${from[0]},${from[1]}`,
    destination: `${to[0]},${to[1]}`,
    travelmode: "transit",
  });
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

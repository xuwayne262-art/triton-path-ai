/**
 * Getting between classes — the campus side of a schedule.
 *
 * A calendar answers "when"; this answers "where, and can I make it". Every
 * section already carries the building code it meets in ("CENTR"), and
 * buildings.json carries UCSD's own coordinates for each code, so a week of
 * chosen sections becomes pins on a map and, day by day, an ordered walk.
 *
 * Walking times come from UCSD's Class Planner when it can route the leg (see
 * walkRoutes.ts) and from a straight-line estimate calibrated against it when
 * it cannot, so a leg is never silently missing — only labelled as estimated.
 */

import type { Building } from "./plat";
import type { CalEvent } from "./sections";
import type { DayOfWeek } from "@/components/triton/types";

export type LatLng = [number, number];

export const WEEKDAYS: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

// ── Distance ─────────────────────────────────────────────────────────────────

const EARTH_M = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Paths are longer than straight lines, and UCSD's router walks 80 m a minute.
 * Calibrated on 20 of its own routed legs this term: the path ran a median
 * 1.37× the straight line (1.01× WLH→Peterson, 1.94× York→Center Hall, where
 * the canyon is in the way), at 64–84 m/min once its minutes are rounded up.
 */
export const DETOUR = 1.37;
export const WALK_M_PER_MIN = 80;

export interface Walk {
  meters: number;
  minutes: number;
}

/** A leg's length and time when UCSD has not routed it. */
export function estimateWalk(a: LatLng, b: LatLng): Walk {
  const meters = Math.round(haversineMeters(a, b) * DETOUR);
  return { meters, minutes: Math.max(1, Math.ceil(meters / WALK_M_PER_MIN)) };
}

// ── A day, in order ──────────────────────────────────────────────────────────

/**
 * How a leg between two consecutive classes looks:
 * - "same"  the next class is in the same building;
 * - "ok"    the walk fits with time to spare;
 * - "tight" it fits with under three minutes to spare;
 * - "late"  the walk takes longer than the break — UCSD's own planner flags this;
 * - "clash" the two classes overlap, so there is no break at all;
 * - "unknown" one end has no location, so nothing can be said.
 */
export type LegStatus = "same" | "ok" | "tight" | "late" | "clash" | "unknown";

/** Minutes of slack under which a connection counts as tight. */
export const TIGHT_SLACK = 3;

export function legStatus(gap: number, minutes: number | null, sameBuilding: boolean): LegStatus {
  if (gap < 0) return "clash";
  if (sameBuilding) return "same";
  if (minutes == null) return "unknown";
  if (minutes > gap) return "late";
  if (gap - minutes < TIGHT_SLACK) return "tight";
  return "ok";
}

export interface Stop {
  /** 1-based position in the day. */
  n: number;
  event: CalEvent;
  /** Null for a TBA or remote meeting, or a building UCSD has no coordinates for. */
  building: Building | null;
}

/** A walk as UCSD's Class Planner routed it. */
export interface RoutedLeg extends Walk {
  day: DayOfWeek;
  from: string;
  fromStart: number;
  to: string;
  toStart: number;
  /** The path along campus walkways, [lat, lng] pairs. */
  path: LatLng[];
}

export interface Leg {
  from: Stop;
  to: Stop;
  /** Minutes between the end of one class and the start of the next. */
  gap: number;
  walk: Walk | null;
  status: LegStatus;
  /** UCSD's walkway geometry when it routed this leg; null means draw a straight line. */
  path: LatLng[] | null;
  source: "ucsd" | "estimate" | "none";
}

export interface DayPlan {
  day: DayOfWeek;
  stops: Stop[];
  legs: Leg[];
}

/** Joins a routed leg from UCSD to the leg it describes in our own day. */
export const legKey = (day: DayOfWeek, from: string, fromStart: number, to: string, toStart: number) =>
  `${day}|${from}@${fromStart}>${to}@${toStart}`;

/**
 * One day's classes in the order you attend them, and the walk between each
 * consecutive pair. Ghost blocks (previews, open options) are not part of the
 * day; a preview is planned separately with {@link previewWalks}.
 */
export function planDay(
  events: CalEvent[],
  day: DayOfWeek,
  buildings: Record<string, Building>,
  routes?: Map<string, RoutedLeg>,
): DayPlan {
  const todays = events
    .filter((e) => e.day === day && !e.ghost)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin || a.code.localeCompare(b.code));

  const stops: Stop[] = todays.map((event, i) => ({
    n: i + 1,
    event,
    building: (event.buildingCode && buildings[event.buildingCode]) || null,
  }));

  const legs: Leg[] = [];
  for (let i = 1; i < stops.length; i++) {
    legs.push(connect(stops[i - 1], stops[i], day, routes));
  }
  return { day, stops, legs };
}

function connect(from: Stop, to: Stop, day: DayOfWeek, routes?: Map<string, RoutedLeg>): Leg {
  const gap = to.event.startMin - from.event.endMin;
  const same = Boolean(from.event.buildingCode) && from.event.buildingCode === to.event.buildingCode;

  if (same || !from.building || !to.building) {
    return {
      from, to, gap,
      walk: same ? { meters: 0, minutes: 0 } : null,
      status: legStatus(gap, same ? 0 : null, same),
      path: null,
      source: "none",
    };
  }

  const routed = routes?.get(
    legKey(day, from.event.buildingCode, from.event.startMin, to.event.buildingCode, to.event.startMin),
  );
  const walk = routed ? { meters: routed.meters, minutes: routed.minutes } : estimateWalk(from.building.ll, to.building.ll);
  return {
    from, to, gap, walk,
    status: legStatus(gap, walk.minutes, false),
    path: routed?.path.length ? routed.path : null,
    source: routed ? "ucsd" : "estimate",
  };
}

/** The legs a student should worry about: late, tight or clashing. */
export const troubleLegs = (plan: DayPlan) =>
  plan.legs.filter((l) => l.status === "late" || l.status === "tight" || l.status === "clash");

/**
 * For an option being hovered: the walk in from the class before it and out to
 * the class after it, on each day it meets. This is what lets a student pick
 * the discussion that is five minutes from their lecture rather than fifteen.
 */
export interface PreviewWalk {
  day: DayOfWeek;
  /** The committed class just before the option, and the walk from it. */
  before: { event: CalEvent; gap: number; walk: Walk | null; status: LegStatus } | null;
  /** The committed class just after it. */
  after: { event: CalEvent; gap: number; walk: Walk | null; status: LegStatus } | null;
}

export function previewWalks(
  option: CalEvent[],
  committed: CalEvent[],
  buildings: Record<string, Building>,
): PreviewWalk[] {
  const out: PreviewWalk[] = [];
  for (const o of option) {
    const sameDay = committed.filter((e) => e.day === o.day && !e.ghost && e.code !== o.code);
    const prev = sameDay
      .filter((e) => e.endMin <= o.startMin)
      .sort((a, b) => b.endMin - a.endMin)[0];
    const next = sameDay
      .filter((e) => e.startMin >= o.endMin)
      .sort((a, b) => a.startMin - b.startMin)[0];

    const link = (a: CalEvent, b: CalEvent) => {
      const gap = b.startMin - a.endMin;
      const same = Boolean(a.buildingCode) && a.buildingCode === b.buildingCode;
      const ba = (a.buildingCode && buildings[a.buildingCode]) || null;
      const bb = (b.buildingCode && buildings[b.buildingCode]) || null;
      const walk = same ? { meters: 0, minutes: 0 } : ba && bb ? estimateWalk(ba.ll, bb.ll) : null;
      return { gap, walk, status: legStatus(gap, walk ? walk.minutes : null, same) };
    };

    out.push({
      day: o.day,
      before: prev ? { event: prev, ...link(prev, o) } : null,
      after: next ? { event: next, ...link(o, next) } : null,
    });
  }
  return out;
}

// ── The map's pins ───────────────────────────────────────────────────────────

export interface Pin {
  code: string;
  building: Building;
  /** Every block that meets here, in weekly order. */
  events: CalEvent[];
  /** Distinct course codes, for the pin's label. */
  courses: string[];
}

/**
 * One pin per building. Meetings that cannot be placed — TBA, remote, or a
 * building UCSD's map has no coordinates for — come back separately so the
 * panel can say so, rather than quietly dropping them off the map.
 */
export function pinsFor(
  events: CalEvent[],
  buildings: Record<string, Building>,
): { pins: Pin[]; unplaced: CalEvent[] } {
  const byCode = new Map<string, Pin>();
  const unplaced: CalEvent[] = [];
  const order = (e: CalEvent) => WEEKDAYS.indexOf(e.day) * 1440 + e.startMin;

  for (const e of [...events].sort((a, b) => order(a) - order(b))) {
    const b = e.buildingCode ? buildings[e.buildingCode] : undefined;
    if (!b) { unplaced.push(e); continue; }
    let pin = byCode.get(e.buildingCode);
    if (!pin) {
      pin = { code: e.buildingCode, building: b, events: [], courses: [] };
      byCode.set(e.buildingCode, pin);
    }
    pin.events.push(e);
    if (!pin.courses.includes(e.code)) pin.courses.push(e.code);
  }
  return { pins: [...byCode.values()], unplaced };
}

/** The first weekday that has a class, for the map to open on. */
export function firstBusyDay(events: CalEvent[], today: DayOfWeek | null = null): DayOfWeek | null {
  const busy = new Set(events.filter((e) => !e.ghost).map((e) => e.day));
  if (today && busy.has(today)) return today;
  return WEEKDAYS.find((d) => busy.has(d)) ?? null;
}

/** Metres and minutes walked in a whole week of the schedule, for the summary line. */
export function weeklyWalking(plans: DayPlan[]): Walk {
  let meters = 0;
  let minutes = 0;
  for (const p of plans) {
    for (const l of p.legs) {
      if (!l.walk || l.status === "clash") continue;
      meters += l.walk.meters;
      minutes += l.walk.minutes;
    }
  }
  return { meters, minutes };
}

/**
 * Google Maps walking directions to a building. Opened in a new tab, it is the
 * one hand-off that turns "Center Hall" into turn-by-turn on a phone.
 */
export function directionsUrl(to: LatLng, from?: LatLng): string {
  const p = new URLSearchParams({ api: "1", destination: `${to[0]},${to[1]}`, travelmode: "walking" });
  if (from) p.set("origin", `${from[0]},${from[1]}`);
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

/** "518 m", "1.2 km" */
export function formatDistance(meters: number): string {
  if (meters < 950) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

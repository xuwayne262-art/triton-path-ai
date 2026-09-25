/**
 * Walking routes between a student's classes, from UCSD's Class Planner.
 *
 * Class Planner's /schedules/{ref} answers a schedule with `map_data`: each
 * building, and for each day the ordered stops and the walk between every
 * consecutive pair — distance, minutes and the path along campus walkways.
 * It sends no CORS headers, so a browser cannot ask it directly; /api/walk
 * asks on the student's behalf. Everything that shapes that exchange lives
 * here, so it can be tested without a network.
 */

import type { DayOfWeek } from "@/components/triton/types";
import type { LatLng, RoutedLeg } from "./campus";

export const CLASS_PLANNER_API = "https://classplanner.apps.ucsd.edu/api/v1";

/**
 * TSS section ids are ten characters: "E 00000959", or two letters then eight
 * digits. Anything else never reaches UCSD — the ref is built from these, so
 * validating them is what keeps the upstream URL ours.
 */
const SECTION_ID = /^[A-Z][A-Z ]\d{8}$/;
const TERM = /^[A-Z][A-Z0-9]\d{2}$/;

/** Class Planner caps a schedule at 15 courses; no real week needs more rows than this. */
export const MAX_SECTIONS = 60;

export type RouteRequest =
  | { ok: true; term: string; ids: string[] }
  | { ok: false; error: string };

/** `?term=FA26&ids=E 00000959,E 00003991` → a canonical, validated request. */
export function parseRouteRequest(params: URLSearchParams): RouteRequest {
  const term = (params.get("term") ?? "").trim();
  if (!TERM.test(term)) return { ok: false, error: "term must look like FA26" };

  const raw = (params.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!raw.length) return { ok: false, error: "ids is required" };
  if (raw.length > MAX_SECTIONS) return { ok: false, error: `at most ${MAX_SECTIONS} sections` };
  if (!raw.every((id) => SECTION_ID.test(id))) return { ok: false, error: "ids must be TSS section ids" };

  return { ok: true, term, ids: [...new Set(raw)].sort() };
}

/**
 * Class Planner's share-link ref: "CS2" + unpadded base64 of {s: ids, t: term}.
 * The server refuses one whose ids are not sorted ascending ("Schedule ref is
 * not canonical"), so this sorts and de-duplicates rather than trusting input.
 */
export function scheduleRef(ids: string[], term: string): string {
  const s = [...new Set(ids)].sort();
  return "CS2" + btoa(JSON.stringify({ s, t: term })).replace(/=+$/, "");
}

// ── Shaping the upstream answer ──────────────────────────────────────────────

/** Class Planner's day codes. R is Thursday, as on every UCSD schedule. */
const DAY: Record<string, DayOfWeek> = { M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri" };

interface UpstreamLocation { key?: string; building_code?: string }
interface UpstreamStop { sequence?: number; location_key?: string; start_minutes?: number }
interface UpstreamTransition {
  from_sequence?: number;
  to_sequence?: number;
  distance_meters?: number;
  estimated_minutes?: number;
  geometry?: { type?: string; coordinates?: unknown };
}
interface UpstreamDay { day_code?: string; stops?: UpstreamStop[]; transitions?: UpstreamTransition[] }
interface UpstreamSchedule { map_data?: { locations?: UpstreamLocation[]; days?: UpstreamDay[] } }

/**
 * The routed legs and nothing else — no seats, no names, no section list, so
 * the proxy passes on only what the map draws. Legs are keyed by building code
 * and start minute, the two things our own day plan knows each stop by.
 */
export function shapeRoutes(upstream: unknown): RoutedLeg[] {
  const map = (upstream as UpstreamSchedule | null)?.map_data;
  if (!map || !Array.isArray(map.days)) return [];

  // A stop names its location by key; the key is the building code in every
  // response seen so far, but the locations table is the authority on that.
  const codeOf = new Map<string, string>();
  for (const loc of map.locations ?? []) {
    if (loc?.key) codeOf.set(loc.key, loc.building_code || loc.key);
  }

  const legs: RoutedLeg[] = [];
  for (const d of map.days) {
    const day = DAY[d?.day_code ?? ""];
    if (!day) continue;
    const bySeq = new Map<number, UpstreamStop>();
    for (const s of d.stops ?? []) {
      if (typeof s?.sequence === "number") bySeq.set(s.sequence, s);
    }
    for (const t of d.transitions ?? []) {
      const a = bySeq.get(t?.from_sequence ?? -1);
      const b = bySeq.get(t?.to_sequence ?? -1);
      if (!a?.location_key || !b?.location_key) continue;
      if (typeof a.start_minutes !== "number" || typeof b.start_minutes !== "number") continue;
      if (typeof t.distance_meters !== "number" || typeof t.estimated_minutes !== "number") continue;
      legs.push({
        day,
        from: codeOf.get(a.location_key) ?? a.location_key,
        fromStart: a.start_minutes,
        to: codeOf.get(b.location_key) ?? b.location_key,
        toStart: b.start_minutes,
        meters: Math.round(t.distance_meters),
        minutes: Math.max(0, Math.round(t.estimated_minutes)),
        path: pathOf(t.geometry),
      });
    }
  }
  return legs;
}

/**
 * GeoJSON LineString → [lat, lng] pairs. GeoJSON puts longitude first, which
 * is the one thing about it everybody gets wrong once. Rounded to 5 places —
 * about a metre, finer than any walkway — which roughly halves the payload.
 */
function pathOf(geometry: UpstreamTransition["geometry"]): LatLng[] {
  if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) return [];
  const out: LatLng[] = [];
  for (const pt of geometry.coordinates) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const [lng, lat] = pt as unknown[];
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push([+lat.toFixed(5), +lng.toFixed(5)]);
  }
  return out;
}

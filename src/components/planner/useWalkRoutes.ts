"use client";

import { useEffect, useMemo, useState } from "react";
import { legKey, type RoutedLeg } from "@/lib/campus";
import type { CalEvent } from "@/lib/sections";

/**
 * UCSD's walking routes for the schedule on screen, via /api/walk.
 *
 * The request waits for the student to stop clicking, is made once per
 * distinct set of sections — results are kept for the session — and is only
 * made at all while something will show it. Until it lands, and whenever it
 * fails, every leg is drawn from the straight-line estimate, so "loading" and
 * "unavailable" change a label on the map, never what the map can say.
 */

export type RouteSource = "off" | "loading" | "ucsd" | "estimate";

/** Class Planner routes at most 15 courses per schedule. */
const MAX_COURSES = 15;
const SETTLE_MS = 450;

/** Per session: a schedule's routes, or null for one UCSD could not route. */
const results = new Map<string, RoutedLeg[] | null>();

export function useWalkRoutes(events: CalEvent[], term: string, enabled: boolean) {
  const key = useMemo(() => {
    const committed = events.filter((e) => !e.ghost && e.sectionId);
    if (new Set(committed.map((e) => e.code)).size > MAX_COURSES) return "";
    return [...new Set(committed.map((e) => e.sectionId))].sort().join(",");
  }, [events]);

  // Bumped when a request settles, so the render below re-reads `results`.
  const [, setSettled] = useState(0);

  useEffect(() => {
    if (!enabled || !term || !key || results.has(key)) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/walk?term=${encodeURIComponent(term)}&ids=${encodeURIComponent(key)}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { legs?: RoutedLeg[] };
        results.set(key, Array.isArray(body.legs) ? body.legs : []);
      } catch {
        if (ctrl.signal.aborted) return;
        results.set(key, null);
      }
      setSettled((n) => n + 1);
    }, SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [enabled, term, key]);

  const legs = key ? results.get(key) : undefined;

  const routes = useMemo(() => {
    const m = new Map<string, RoutedLeg>();
    for (const l of legs ?? []) m.set(legKey(l.day, l.from, l.fromStart, l.to, l.toStart), l);
    return m;
  }, [legs]);

  const source: RouteSource = !key || !enabled
    ? "off"
    : legs === undefined
      ? "loading"
      : legs === null
        ? "estimate"
        : "ucsd";

  return { routes, source };
}

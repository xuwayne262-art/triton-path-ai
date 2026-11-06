"use client";

import { useSyncExternalStore } from "react";
import { cleanPlanner, type PlannerDoc } from "@/lib/plan/record";
import { picksFor } from "@/lib/plan/term";
import { PLANNER_EVENT, PLANNER_KEY } from "@/lib/plan/sync";
import type { SectionSelection } from "@/lib/sections";

/**
 * Whether a course is on this term's schedule in the Planner, and with which
 * sections — read, never written, from the Planner's own copy in this
 * browser. A course page uses it to say "On your Fall 2026 schedule:
 * Lecture B, Lab B03" rather than leaving a saved course and a scheduled
 * section to look like the same thing.
 */

let cacheRaw: string | null | undefined;
let cache: PlannerDoc | null = null;

function read(): PlannerDoc | null {
  let raw: string | null = null;
  try { raw = localStorage.getItem(PLANNER_KEY); } catch { return null; }
  if (raw === cacheRaw) return cache;
  cacheRaw = raw;
  try { cache = cleanPlanner(JSON.parse(raw ?? "null")); } catch { cache = null; }
  return cache;
}

function subscribe(cb: () => void) {
  window.addEventListener(PLANNER_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(PLANNER_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export interface PlannerEntry {
  scheduled: boolean;
  sections: SectionSelection | null;
}

/** Null until known. Each quarter's schedule is read from its own picks in the plan. */
export function usePlannerEntry(code: string, term: string | null): PlannerEntry | null {
  const doc = useSyncExternalStore(subscribe, read, () => null);
  if (!doc || !term) return null;
  const picks = picksFor(doc, term);
  const scheduled = picks.schedule.some((e) => e.course.code === code);
  return { scheduled, sections: scheduled ? picks.sections?.[code] ?? null : null };
}

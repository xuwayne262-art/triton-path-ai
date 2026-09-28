"use client";

import { useCallback, useSyncExternalStore } from "react";
import { clamp5, cleanRatings, type TermRating, type TermRatings } from "@/lib/plan/record";
import {
  noteLocalChange, RATINGS_EVENT, RATINGS_KEY, useAccountSync,
} from "@/lib/plan/sync";

export type { TermRating, TermRatings };

const EMPTY: TermRatings = {};

// Cached so getSnapshot returns a stable reference; parsing on every call would
// hand React a new object each render and loop forever. Same reason as
// useShortlist — see the note there.
let cache: TermRatings = EMPTY;
let cacheRaw: string | null = null;

/**
 * Rebuilds the map from raw storage, dropping anything malformed. localStorage
 * is editable by hand and survives across deploys, so nothing here may assume
 * the stored shape is still the shape this build writes.
 */
function parse(raw: string | null): TermRatings {
  if (!raw) return EMPTY;
  let obj: unknown;
  try { obj = JSON.parse(raw); } catch { return EMPTY; }
  const out = cleanRatings(obj);
  return Object.keys(out).length ? out : EMPTY;
}

function read(): TermRatings {
  let raw: string | null = null;
  try { raw = localStorage.getItem(RATINGS_KEY); } catch { return EMPTY; }
  if (raw === cacheRaw) return cache;
  cacheRaw = raw;
  cache = parse(raw);
  return cache;
}

const subscribe = (cb: () => void) => {
  window.addEventListener(RATINGS_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(RATINGS_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

/**
 * Ratings are scoped to instructor *and* course *and* term, because the same
 * professor can teach two courses in one term and deserve a separate verdict on
 * each. "::" cannot appear in a subject code, course number or instructor name.
 */
export const ratingKey = (term: string, code: string, instructor: string) =>
  `${term}::${code}::${instructor}`;

/**
 * Per-term instructor ratings, kept in localStorage and saved to the student's
 * own account (lib/plan/sync.ts) so they follow them between devices.
 *
 * These are this student's own ratings — nothing pools them into a shared
 * score, so nothing here should be presented to the user as a community
 * average.
 */
export function useTermRatings() {
  useAccountSync();
  const ratings = useSyncExternalStore(subscribe, read, () => EMPTY);

  const save = useCallback((key: string, value: Omit<TermRating, "at">) => {
    const quality = clamp5(value.quality);
    if (quality < 1) return; // never persist a rating the reader would drop
    const next: TermRatings = {
      ...read(),
      [key]: {
        quality,
        difficulty: clamp5(value.difficulty),
        again: typeof value.again === "boolean" ? value.again : null,
        at: new Date().toISOString(),
      },
    };
    try { localStorage.setItem(RATINGS_KEY, JSON.stringify(next)); } catch {}
    window.dispatchEvent(new Event(RATINGS_EVENT));
    noteLocalChange();
  }, []);

  const clear = useCallback((key: string) => {
    const current = read();
    if (!(key in current)) return;
    const next = { ...current };
    delete next[key];
    try { localStorage.setItem(RATINGS_KEY, JSON.stringify(next)); } catch {}
    window.dispatchEvent(new Event(RATINGS_EVENT));
    noteLocalChange();
  }, []);

  return { ratings, save, clear };
}

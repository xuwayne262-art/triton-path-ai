"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "ucsdplans-term-ratings";
const EVENT = "ucsdplans-term-ratings-change";

/** One student's verdict on one instructor, for one course, in one term. */
export interface TermRating {
  /** 1-5. A rating without this is not a rating, and is dropped on read. */
  quality: number;
  /** 1-5, or 0 when the rater skipped it. */
  difficulty: number;
  /** null when the rater skipped it. */
  again: boolean | null;
  /** ISO-8601, set on save. */
  at: string;
}

export type TermRatings = Record<string, TermRating>;

const EMPTY: TermRatings = {};

// Cached so getSnapshot returns a stable reference; parsing on every call would
// hand React a new object each render and loop forever. Same reason as
// useShortlist — see the note there.
let cache: TermRatings = EMPTY;
let cacheRaw: string | null = null;

/** Whole numbers 0-5. Anything unparseable becomes 0 rather than NaN. */
function clamp5(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  const v = Math.round(n);
  return v < 0 ? 0 : v > 5 ? 5 : v;
}

/**
 * Rebuilds the map from raw storage, dropping anything malformed. localStorage
 * is editable by hand and survives across deploys, so nothing here may assume
 * the stored shape is still the shape this build writes.
 */
function parse(raw: string | null): TermRatings {
  if (!raw) return EMPTY;
  let obj: unknown;
  try { obj = JSON.parse(raw); } catch { return EMPTY; }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return EMPTY;

  const out: TermRatings = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const r = v as Record<string, unknown>;
    const quality = clamp5(r.quality);
    if (quality < 1) continue;
    out[k] = {
      quality,
      difficulty: clamp5(r.difficulty),
      again: typeof r.again === "boolean" ? r.again : null,
      at: typeof r.at === "string" ? r.at : "",
    };
  }
  return Object.keys(out).length ? out : EMPTY;
}

function read(): TermRatings {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { return EMPTY; }
  if (raw === cacheRaw) return cache;
  cacheRaw = raw;
  cache = parse(raw);
  return cache;
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
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
 * Per-term instructor ratings, kept in localStorage.
 *
 * These are this browser's own ratings — there is no backend to pool them into a
 * shared score, so nothing here should be presented to the user as a community
 * average.
 */
export function useTermRatings() {
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
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const clear = useCallback((key: string) => {
    const current = read();
    if (!(key in current)) return;
    const next = { ...current };
    delete next[key];
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { ratings, save, clear };
}

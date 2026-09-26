"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Place } from "@/lib/housing/geocode";

/**
 * Addresses a student is weighing up that are not listed here — a Zillow
 * find, a friend's lease — kept in this browser so they survive a reload and
 * sit on the map beside the listings, lettered A to D.
 *
 * Browser-only on purpose: they are one student's shortlist, and an address
 * someone is thinking of renting is nobody else's business. Read through
 * useSyncExternalStore, like usePref, so the server render and the first
 * client render agree; when storage refuses, the list lasts until the page closes.
 */

const KEY = "ucsdplans-housing-checked";
const EVENT = "ucsdplans-housing-checked";
export const MAX_CHECKED = 4;

export interface CheckedPlace extends Place {
  id: string;
}

const NONE: CheckedPlace[] = [];
/** The list, when storage refused to keep it (private windows, blocked site data). */
let memory: string | null = null;
let cachedRaw: string | null | undefined;
let cached: CheckedPlace[] = NONE;

function parse(raw: string | null): CheckedPlace[] {
  try {
    const v = JSON.parse(raw ?? "[]") as unknown;
    if (!Array.isArray(v)) return NONE;
    return v
      .filter((p): p is CheckedPlace =>
        Boolean(p) && typeof p.id === "string" && typeof p.address === "string" &&
        Array.isArray(p.ll) && p.ll.length === 2 && p.ll.every((n: unknown) => typeof n === "number"))
      .slice(0, MAX_CHECKED);
  } catch {
    return NONE;
  }
}

/** Same array back until the stored text changes — useSyncExternalStore compares by identity. */
function snapshot(): CheckedPlace[] {
  let raw = memory;
  if (raw === null) {
    try { raw = localStorage.getItem(KEY); } catch {}
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parse(raw);
  }
  return cached;
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

function write(next: CheckedPlace[]) {
  const raw = JSON.stringify(next);
  try {
    localStorage.setItem(KEY, raw);
    memory = null;
  } catch {
    memory = raw;
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useCheckedPlaces() {
  const places = useSyncExternalStore(subscribe, snapshot, () => NONE);

  const add = useCallback((p: Place): CheckedPlace => {
    // The same address twice is one place; a fifth pushes out the oldest.
    const rest = snapshot().filter((c) => c.address !== p.address);
    const added = { ...p, id: `chk-${Date.now().toString(36)}` };
    write([...rest, added].slice(-MAX_CHECKED));
    return added;
  }, []);

  const remove = useCallback((id: string) => write(snapshot().filter((c) => c.id !== id)), []);

  return { places, add, remove };
}

/** A, B, C, D — the pin label for the nth checked place. */
export const letterFor = (i: number) => String.fromCharCode(65 + i);

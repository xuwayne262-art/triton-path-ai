"use client";

import { useCallback, useSyncExternalStore } from "react";
import { cleanShortlist } from "@/lib/plan/record";
import {
  noteLocalChange, SHORTLIST_EVENT, SHORTLIST_KEY, useAccountSync,
} from "@/lib/plan/sync";

const EMPTY: string[] = [];

// Cached so getSnapshot returns a stable reference; parsing on every call would
// hand React a new array each render and loop forever.
let cache: string[] = EMPTY;
let cacheRaw: string | null = null;

function read(): string[] {
  let raw: string | null = null;
  try { raw = localStorage.getItem(SHORTLIST_KEY); } catch { return EMPTY; }
  if (raw === cacheRaw) return cache;
  cacheRaw = raw;
  try {
    const codes = cleanShortlist(JSON.parse(raw ?? "[]"));
    cache = codes.length ? codes : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

const subscribe = (cb: () => void) => {
  window.addEventListener(SHORTLIST_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(SHORTLIST_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

/**
 * Course codes starred while browsing, kept in localStorage so the planner can
 * pick them up and broadcast so every mounted component stays in sync. The
 * list is part of the plan saved to the student's account (lib/plan/sync.ts),
 * so a star added on a phone is there on a laptop.
 */
export function useShortlist() {
  useAccountSync();
  const codes = useSyncExternalStore(subscribe, read, () => EMPTY);

  const toggle = useCallback((code: string) => {
    const current = read();
    const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
    try { localStorage.setItem(SHORTLIST_KEY, JSON.stringify(next)); } catch {}
    window.dispatchEvent(new Event(SHORTLIST_EVENT));
    noteLocalChange();
  }, []);

  return { codes, toggle, has: (code: string) => codes.includes(code) };
}

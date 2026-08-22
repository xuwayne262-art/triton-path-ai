"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "tritonplat-shortlist";
const EVENT = "tritonplat-shortlist-change";

const EMPTY: string[] = [];

// Cached so getSnapshot returns a stable reference; parsing on every call would
// hand React a new array each render and loop forever.
let cache: string[] = EMPTY;
let cacheRaw: string | null = null;

function read(): string[] {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { return EMPTY; }
  if (raw === cacheRaw) return cache;
  cacheRaw = raw;
  try {
    const parsed = JSON.parse(raw ?? "[]");
    cache = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : EMPTY;
  } catch {
    cache = EMPTY;
  }
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
 * Course codes starred while browsing, kept in localStorage so the planner can
 * pick them up and broadcast so every mounted component stays in sync.
 */
export function useShortlist() {
  const codes = useSyncExternalStore(subscribe, read, () => EMPTY);

  const toggle = useCallback((code: string) => {
    const current = read();
    const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { codes, toggle, has: (code: string) => codes.includes(code) };
}

"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A remembered view choice — which rail tab, whether the map is open — kept in
 * this browser only. Read through useSyncExternalStore so the server render and
 * the first client render agree (both see the fallback), and every component
 * using the same key stays in step when one of them changes it.
 *
 * Storage can be missing or throw (private windows, blocked site data); the
 * choice then simply lasts until the page closes.
 */

const EVENT = "ucsdplans-pref";

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

/** Values set this session, for when storage refuses them. */
const memory = new Map<string, string>();

export function usePref<T extends string>(
  key: string,
  fallback: T,
  valid: (v: string) => v is T,
): [T, (value: T) => void] {
  const read = useCallback((): T => {
    let v: string | null = null;
    try { v = localStorage.getItem(key); } catch {}
    v ??= memory.get(key) ?? null;
    return v != null && valid(v) ? v : fallback;
  }, [key, fallback, valid]);

  const value = useSyncExternalStore(subscribe, read, () => fallback);

  const set = useCallback((next: T) => {
    memory.set(key, next);
    try { localStorage.setItem(key, next); } catch {}
    window.dispatchEvent(new Event(EVENT));
  }, [key]);

  return [value, set];
}

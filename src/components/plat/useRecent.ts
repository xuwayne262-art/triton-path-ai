"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { cleanRecent, RECENT_EVENT, RECENT_KEY, withVisit, type RecentItem } from "@/lib/recent";

const EMPTY: RecentItem[] = [];

// Cached so getSnapshot hands React the same array until storage changes.
let cache: RecentItem[] = EMPTY;
let cacheRaw: string | null = null;

function read(): RecentItem[] {
  let raw: string | null = null;
  try { raw = localStorage.getItem(RECENT_KEY); } catch { return EMPTY; }
  if (raw === cacheRaw) return cache;
  cacheRaw = raw;
  try {
    const list = cleanRecent(JSON.parse(raw ?? "[]"));
    cache = list.length ? list : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(list: RecentItem[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* private window: nothing kept */ }
  window.dispatchEvent(new Event(RECENT_EVENT));
}

const subscribe = (cb: () => void) => {
  window.addEventListener(RECENT_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(RECENT_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

/** Records a visit or a search in this browser's recent list. */
export function noteRecent(item: Omit<RecentItem, "at">) {
  if (typeof window === "undefined" || !item.key.trim()) return;
  write(withVisit(read(), { ...item, at: Date.now() }));
}

/** This browser's recent list, newest first, and a way to empty it. */
export function useRecent() {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);
  const clear = useCallback(() => write([]), []);
  return { items, clear };
}

/**
 * Notes a page visit once its subject is known. `item` is null while the page
 * is still loading what it is about.
 */
export function useNoteVisit(item: Omit<RecentItem, "at"> | null) {
  const key = item ? `${item.kind}|${item.key}|${item.label}|${item.href}` : null;
  useEffect(() => {
    if (!key || !item) return;
    noteRecent(item);
    // `key` captures everything about `item` that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

"use client";

import { useSyncExternalStore } from "react";

/**
 * The time, for saying how old a seat count is. It moves once a minute, which
 * is finer than any age the site prints, and every reader sees the same
 * instant. The server has no "now" worth rendering, so it says null and the
 * age appears once the page is in the browser.
 */

let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const getSnapshot = () => {
  if (!now) now = Date.now();
  return now;
};
const getServerSnapshot = () => 0;

export function useNow(): number | null {
  const t = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return t || null;
}

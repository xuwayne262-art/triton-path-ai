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

function tick() {
  now = Date.now();
  for (const l of listeners) l();
}

/**
 * A tab put to sleep (a laptop closed overnight, a phone's browser in the
 * background) misses its minutes; coming back reads the clock at once, so a
 * date that turned "today" while it slept says so.
 */
function onWake() {
  if (document.visibilityState === "visible") tick();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("pageshow", onWake);
    window.addEventListener("focus", onWake);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("pageshow", onWake);
      window.removeEventListener("focus", onWake);
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

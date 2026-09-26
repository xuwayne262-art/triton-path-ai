"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches, kept live as the window resizes or a phone
 * rotates. The server has no screen, so it — and the first client render,
 * which must agree with it — sees `serverValue`; the real answer follows a
 * frame later. Layout that must not flash is done in CSS (`max-md:`); this is
 * for behaviour, like whether tapping a class opens its details.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** The planner's phone layout: one pane at a time, below Tailwind's `md`. */
export const PHONE = "(max-width: 767.98px)";
/** A mouse or trackpad — something that can hover without clicking. */
export const CAN_HOVER = "(hover: hover)";

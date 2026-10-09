"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A container's width in CSS pixels, kept current as it resizes, so a chart
 * can draw at real size instead of scaling its text with a viewBox. Zero
 * until the first measurement.
 */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 0);
      setWidth((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

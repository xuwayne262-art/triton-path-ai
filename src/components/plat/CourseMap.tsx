"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Where a course meets, as a small map on its page — the planner's campus map
 * cut down to the pins, with the same OpenFreeMap tiles (no key, no limits).
 * It is a picture to orient by, so it does not take the page's scroll or
 * clicks; the names beside it and the planner's map do the rest.
 *
 * Loaded only on the course page, through next/dynamic: MapLibre is about a
 * megabyte.
 */

export interface CoursePin {
  code: string;
  name: string;
  /** [latitude, longitude] */
  ll: [number, number];
}

const STYLE_URL = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
const NAVY = "#182B49";
const GOLD = "#FFCD00";

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function CourseMap({ pins, dark }: { pins: CoursePin[]; dark: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!el.current || !pins.length) return;
    if (!hasWebGL()) {
      const t = setTimeout(() => setFailed(true), 0);
      return () => clearTimeout(t);
    }
    const lngs = pins.map((p) => p.ll[1]);
    const lats = pins.map((p) => p.ll[0]);
    const map = new maplibregl.Map({
      container: el.current,
      style: dark ? STYLE_URL.dark : STYLE_URL.light,
      bounds: [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      fitBoundsOptions: { padding: 48, maxZoom: 16.5 },
      interactive: false,
      attributionControl: { compact: true },
    });
    for (const p of pins) {
      const dot = document.createElement("div");
      dot.setAttribute("aria-hidden", "true");
      dot.style.cssText = `width:14px;height:14px;border-radius:9999px;background:${dark ? GOLD : NAVY};`
        + `box-shadow:0 0 0 3px ${dark ? "#0d1420" : "#ffffff"};`;
      new maplibregl.Marker({ element: dot }).setLngLat([p.ll[1], p.ll[0]]).addTo(map);
    }
    map.on("error", () => { /* a missing tile leaves a blank square, not a broken page */ });
    return () => map.remove();
  }, [pins, dark]);

  if (failed) {
    return (
      <div className="flex h-44 items-center justify-center rounded-xl bg-slate-100 px-4 text-center text-xs text-gray-500 dark:bg-white/5 dark:text-gray-400">
        This browser cannot draw the map.
      </div>
    );
  }
  return <div ref={el} className="h-44 w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-white/5" />;
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { haversineMeters, type LatLng } from "@/lib/campus";
import { LIBRARY_WALK } from "@/lib/housing/commute";
import s from "./HousingMap.module.css";

/**
 * Places to live, on the same map as the buildings you have class in.
 *
 * Same tiles and the same MapLibre build as the campus map (see CampusMap.tsx
 * for why OpenFreeMap, and why v5), zoomed out from one campus to the
 * neighbourhoods around it. A listing is a price tag; a building on your
 * schedule is a gold-ringed dot with its code; and the place being looked at
 * sends a dashed spoke to each building its mornings start in, labelled with
 * the trip.
 */

export interface HomePin {
  id: string;
  ll: LatLng;
  /** "$1,150" for a listing, "A" for an address being checked. */
  label: string;
  kind: "listing" | "checked";
  /** Read out by screen readers and shown on hover. */
  title: string;
  mine?: boolean;
  /** Listed, but not reconfirmed lately. */
  dim?: boolean;
}

export interface ClassPin {
  code: string;
  ll: LatLng;
  name: string;
}

export interface Spoke {
  to: LatLng;
  /** "12 min" */
  label: string;
}

const STYLE_URL = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

/** Between Library Walk and UTC: where most student rentals are. */
const CENTER: [number, number] = [-117.226, 32.868];
/** Oceanside to Chula Vista, the coast to El Cajon — the geocoder's own limits. */
const BOUNDS: [[number, number], [number, number]] = [[-117.62, 32.52], [-116.84, 33.26]];
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
/**
 * How far from Library Walk the first view reaches. One place in Pacific Beach
 * would otherwise zoom the map out until every University City price tag sat
 * on top of the next; farther places are a button away instead.
 */
const NEAR_M = 6_000;
const isNear = (p: LatLng) => haversineMeters(p, LIBRARY_WALK) <= NEAR_M;

const toLngLat = ([lat, lng]: LatLng): [number, number] => [lng, lat];

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

function addOverlay(map: maplibregl.Map) {
  const before = (map.getStyle()?.layers ?? []).find((l) => l.type === "symbol")?.id;
  if (!map.getSource("home-spokes")) map.addSource("home-spokes", { type: "geojson", data: EMPTY });
  if (!map.getLayer("home-spokes-casing")) {
    map.addLayer({
      id: "home-spokes-casing", type: "line", source: "home-spokes",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "casing"], "line-width": 6, "line-opacity": 0.8 },
    }, before);
  }
  if (!map.getLayer("home-spokes")) {
    map.addLayer({
      id: "home-spokes", type: "line", source: "home-spokes",
      paint: { "line-color": ["get", "color"], "line-width": 3, "line-dasharray": [1.6, 1.2] },
    }, before);
  }
}

type Marker = { id: string; marker: maplibregl.Marker; el: HTMLDivElement; inner: HTMLDivElement };

export default function HousingMap(props: {
  darkMode: boolean;
  homes: HomePin[];
  classes: ClassPin[];
  /** The home to pick out — hovered here or in the list. */
  focus: string | null;
  /** Trips from the focused home to class. */
  spokes: Spoke[];
  /** Changes whenever the view should re-frame everything on it. */
  fitKey: string;
  onHover?: (id: string | null) => void;
  onSelect?: (id: string) => void;
  label?: string;
  /** "near" frames the area around campus first; "all" always frames everything. */
  frame?: "near" | "all";
}) {
  const { darkMode, homes, classes, focus, spokes, fitKey, frame = "near" } = props;
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const homeMarkers = useRef(new Map<string, Marker>());
  const classMarkers = useRef(new Map<string, maplibregl.Marker>());
  const spokeLabels = useRef<maplibregl.Marker[]>([]);
  const cbs = useRef(props);
  const firstDark = useRef(darkMode);
  const shownStyle = useRef("");
  const [styleGen, setStyleGen] = useState(0);
  const [drawable] = useState(hasWebGL);
  /** The fitKey for which the student asked to see everything, farther places included. */
  const [allFor, setAllFor] = useState<string | null>(null);
  const showAll = frame === "all" || allFor === fitKey;
  const farCount = useMemo(() => homes.filter((h) => !isNear(h.ll)).length, [homes]);

  useEffect(() => {
    cbs.current = props;
  });

  // ── The map, created once ─────────────────────────────────────────────────
  useEffect(() => {
    const container = box.current;
    if (!container || !drawable) return;
    let map: maplibregl.Map;
    const url = firstDark.current ? STYLE_URL.dark : STYLE_URL.light;
    try {
      map = new maplibregl.Map({
        container,
        style: url,
        center: CENTER,
        zoom: 12.4,
        minZoom: 9.5,
        maxZoom: 18,
        maxBounds: BOUNDS,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
    } catch (err) {
      console.warn("Housing map could not start:", err);
      return;
    }
    shownStyle.current = url;
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("style.load", () => {
      addOverlay(map);
      setStyleGen((g) => g + 1);
    });

    mapRef.current = map;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container);
    const homesNow = homeMarkers.current;
    const classesNow = classMarkers.current;
    return () => {
      ro.disconnect();
      homesNow.clear();
      classesNow.clear();
      spokeLabels.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [drawable]);

  // ── Theme ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const url = darkMode ? STYLE_URL.dark : STYLE_URL.light;
    if (!map || shownStyle.current === url) return;
    shownStyle.current = url;
    map.setStyle(url);
  }, [darkMode]);

  // ── Homes ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const want = new Map(homes.map((h) => [h.id, h]));
    for (const [id, m] of homeMarkers.current) {
      if (!want.has(id)) {
        m.marker.remove();
        homeMarkers.current.delete(id);
      }
    }
    for (const h of homes) {
      let m = homeMarkers.current.get(h.id);
      if (!m) {
        const el = document.createElement("div");
        const inner = document.createElement("div");
        inner.tabIndex = 0;
        inner.setAttribute("role", "button");
        const id = h.id;
        inner.addEventListener("mouseenter", () => cbs.current.onHover?.(id));
        inner.addEventListener("mouseleave", () => cbs.current.onHover?.(null));
        inner.addEventListener("focus", () => cbs.current.onHover?.(id));
        inner.addEventListener("blur", () => cbs.current.onHover?.(null));
        inner.addEventListener("click", (e) => {
          e.stopPropagation();
          cbs.current.onSelect?.(id);
        });
        inner.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            cbs.current.onSelect?.(id);
          }
        });
        const price = document.createElement("div");
        price.className = s.price;
        const tail = document.createElement("div");
        tail.className = s.tail;
        inner.append(price, tail);
        el.appendChild(inner);
        const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(toLngLat(h.ll)).addTo(map);
        m = { id: h.id, marker, el, inner };
        homeMarkers.current.set(h.id, m);
      }
      m.marker.setLngLat(toLngLat(h.ll));
      (m.inner.firstChild as HTMLElement).textContent = h.label;
      m.inner.title = h.title;
      m.inner.setAttribute("aria-label", h.title);
      m.inner.className = [
        s.home,
        h.kind === "checked" ? s.checked : "",
        h.mine ? s.mine : "",
        h.dim ? s.dim : "",
      ].filter(Boolean).join(" ");
    }
  }, [homes]);

  // ── Focus ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    for (const m of homeMarkers.current.values()) {
      const on = m.id === focus;
      m.inner.classList.toggle(s.focus, on);
      m.el.style.zIndex = on ? "5" : "1";
    }
  }, [focus, homes]);

  // ── Class buildings ───────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const want = new Map(classes.map((c) => [c.code, c]));
    for (const [code, m] of classMarkers.current) {
      if (!want.has(code)) {
        m.remove();
        classMarkers.current.delete(code);
      }
    }
    for (const c of classes) {
      if (classMarkers.current.has(c.code)) continue;
      const el = document.createElement("div");
      const tag = document.createElement("div");
      tag.className = s.building;
      tag.textContent = c.code;
      tag.title = c.name;
      el.appendChild(tag);
      el.style.zIndex = "0";
      classMarkers.current.set(
        c.code,
        new maplibregl.Marker({ element: el, anchor: "left", offset: [-4, 0] }).setLngLat(toLngLat(c.ll)).addTo(map),
      );
    }
  }, [classes]);

  // ── Spokes from the focused home ──────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const from = homes.find((h) => h.id === focus)?.ll ?? null;
    const drawn = from ? spokes : [];
    const color = darkMode ? "#FFCD00" : "#182B49";
    const casing = darkMode ? "#0b1220" : "#ffffff";
    (map.getSource("home-spokes") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: drawn.map((sp) => ({
        type: "Feature" as const,
        properties: { color, casing },
        geometry: { type: "LineString" as const, coordinates: [toLngLat(from!), toLngLat(sp.to)] },
      })),
    });

    for (const m of spokeLabels.current) m.remove();
    spokeLabels.current = [];
    for (const sp of drawn) {
      const el = document.createElement("div");
      const pill = document.createElement("div");
      pill.className = s.spoke;
      pill.textContent = sp.label;
      el.appendChild(pill);
      // Two thirds of the way out, so labels on spokes that share a start do
      // not pile up on the home itself.
      const at: LatLng = [from![0] + (sp.to[0] - from![0]) * 0.62, from![1] + (sp.to[1] - from![1]) * 0.62];
      spokeLabels.current.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(toLngLat(at)).addTo(map));
    }
  }, [focus, spokes, homes, darkMode, styleGen]);

  // ── Framing ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Read through the ref: framing follows fitKey alone, since re-framing on
    // every hover would fling the map around under the cursor.
    const { homes, classes } = cbs.current;
    const every: LatLng[] = [...homes.map((h) => h.ll), ...classes.map((c) => c.ll)];
    const near = every.filter(isNear);
    const pts = showAll || !near.length ? every : near;
    const duration = reducedMotion() ? 0 : 700;
    if (!pts.length) {
      map.easeTo({ center: CENTER, zoom: 12.4, duration });
      return;
    }
    if (pts.length === 1) {
      map.easeTo({ center: toLngLat(pts[0]), zoom: 15, duration });
      return;
    }
    const b = new maplibregl.LngLatBounds(toLngLat(pts[0]), toLngLat(pts[0]));
    for (const p of pts) b.extend(toLngLat(p));
    // Extra room on the right and bottom, where the zoom buttons sit over the map.
    map.fitBounds(b, { padding: { top: 48, bottom: 56, left: 48, right: 72 }, maxZoom: 15.5, duration });
  }, [fitKey, showAll]);

  if (!drawable) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-100 p-6 text-center text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
        This browser cannot draw the map (WebGL is off). Every listing still shows its commute in the list.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={box} className="h-full w-full" aria-label={props.label ?? "Map of places to live"} role="region" />
      {!showAll && farCount > 0 && (
        <button
          type="button"
          onClick={() => setAllFor(fitKey)}
          className="absolute left-2 top-2 rounded-full bg-white/95 px-3 py-1 text-[11px] font-semibold text-[#182B49] shadow-md backdrop-blur transition hover:bg-white dark:bg-gray-900/90 dark:text-[#FFCD00]"
        >
          Show {farCount} farther out
        </button>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LatLng, Leg, Pin } from "@/lib/campus";
import { footprintAt, polygonsOf, toPiece, type Footprint } from "@/lib/footprint";
import s from "./CampusMap.module.css";

/**
 * The campus, with this week on it.
 *
 * Vector tiles from OpenFreeMap: no API key, no view limits, and a real dark
 * style. The obvious alternatives both refuse a site like this one — CARTO now
 * answers every tile with "API key required", and OpenStreetMap's own servers
 * block apps under their tile policy — so they would have worked in testing
 * and failed for students.
 *
 * Loaded only when the map is opened: MapLibre is about a megabyte, and most
 * visits never pull the drawer out.
 *
 * MapLibre is held at v5 on purpose. v6 ships its worker as a separate module
 * found through `import.meta.url`, which the bundler rewrites to a file: URL,
 * so the worker never loads; v5 carries its worker inline.
 */

export interface MapPin extends Pin {
  /** Numbered stops on the day's route, each in its course's colour. Empty for the week. */
  badges: { label: string; color: string }[];
  /** One colour per course meeting here, for the week view's dots. */
  colors: string[];
  /** The option being previewed from the rail — where it would send you. */
  ghost?: boolean;
}

const STYLE_URL = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

/** Library Walk — roughly the middle of the main campus. */
const CENTER: [number, number] = [-117.2375, 32.8795];
/** Main campus, Scripps and East Campus: nowhere a class meets is outside this. */
const BOUNDS: [[number, number], [number, number]] = [[-117.285, 32.848], [-117.195, 32.908]];

const NAVY = "#182B49";
/**
 * What the drawn footprints were last built from. Reset to this, which no real
 * signature can equal — an empty week signs as "", and resetting to "" once
 * left a removed course's building lit.
 */
const STALE = "stale";
const GOLD = "#FFCD00";
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

const legColor = (status: Leg["status"], dark: boolean) =>
  status === "late" ? "#ef4444" : status === "tight" ? "#f59e0b" : dark ? GOLD : NAVY;

const toLngLat = ([lat, lng]: LatLng): [number, number] => [lng, lat];

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** MapLibre draws with WebGL; some locked-down or very old browsers have none. */
function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Where the style keeps its building footprints, and the deepest zoom its tiles
 * are cut at. Only tiles at that zoom hold one polygon per building; the ones
 * above it fuse neighbouring buildings into blobs.
 */
function buildingSource(map: maplibregl.Map): { source: string; tileZoom: number } | null {
  const layer = (map.getStyle()?.layers ?? []).find(
    (l) => "source-layer" in l && l["source-layer"] === "building" && (l.type === "fill" || l.type === "fill-extrusion"),
  );
  if (!layer || !("source" in layer) || typeof layer.source !== "string") return null;
  const src = map.getSource(layer.source) as { maxzoom?: number } | undefined;
  return { source: layer.source, tileZoom: src?.maxzoom ?? 14 };
}

/**
 * Footprints found so far, by building code; null where the map has no
 * building near the pin. Kept for the session, so a footprint found while
 * zoomed in still shows once the map pulls back to fit the whole week.
 */
const footprints = new Map<string, Footprint | null>();

function footprintFeatures(fp: Footprint, color: string): GeoJSON.Feature[] {
  return [
    ...fp.parts.map((poly): GeoJSON.Feature => ({
      type: "Feature", properties: { color, kind: "fill" }, geometry: { type: "Polygon", coordinates: poly },
    })),
    ...fp.outline.map((line): GeoJSON.Feature => ({
      type: "Feature", properties: { color, kind: "line" }, geometry: { type: "LineString", coordinates: line },
    })),
  ];
}

/** Our layers go under the style's labels, so street and building names stay legible. */
function addOverlay(map: maplibregl.Map) {
  const before = (map.getStyle()?.layers ?? []).find((l) => l.type === "symbol")?.id;
  if (!map.getSource("ucsd-hot")) map.addSource("ucsd-hot", { type: "geojson", data: EMPTY });
  if (!map.getSource("ucsd-legs")) map.addSource("ucsd-legs", { type: "geojson", data: EMPTY });
  const round = { "line-cap": "round", "line-join": "round" } as const;
  const layers: maplibregl.AddLayerObject[] = [
    {
      id: "ucsd-hot-fill", type: "fill", source: "ucsd-hot",
      filter: ["==", ["get", "kind"], "fill"],
      // Unsmoothed, so the two halves of a building a tile edge cut meet with
      // no hairline; the outline above draws the building's real edge.
      paint: { "fill-color": ["get", "color"], "fill-opacity": 0.38, "fill-antialias": false },
    },
    {
      id: "ucsd-hot-line", type: "line", source: "ucsd-hot", layout: round,
      filter: ["==", ["get", "kind"], "line"],
      paint: { "line-color": ["get", "color"], "line-width": 1.75 },
    },
    {
      id: "ucsd-legs-casing", type: "line", source: "ucsd-legs", layout: round,
      paint: { "line-color": ["get", "casing"], "line-width": 7.5, "line-opacity": 0.85 },
    },
    {
      id: "ucsd-legs-routed", type: "line", source: "ucsd-legs", layout: round,
      filter: ["==", ["get", "source"], "ucsd"],
      paint: { "line-color": ["get", "color"], "line-width": 4 },
    },
    {
      id: "ucsd-legs-estimated", type: "line", source: "ucsd-legs",
      filter: ["!=", ["get", "source"], "ucsd"],
      paint: { "line-color": ["get", "color"], "line-width": 3.5, "line-dasharray": [1.4, 1.1] },
    },
  ];
  for (const layer of layers) if (!map.getLayer(layer.id)) map.addLayer(layer, before);
}

/** Where along a path its label should sit: half its length, not its middle vertex. */
function midpoint(path: LatLng[]): LatLng {
  if (path.length < 2) return path[0];
  const seg = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
  let left = seg.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i] && seg[i] > 0) {
      const t = left / seg[i];
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t];
    }
    left -= seg[i];
  }
  return path[path.length - 1];
}

const legPath = (l: Leg): LatLng[] | null =>
  l.path?.length ? l.path : l.from.building && l.to.building ? [l.from.building.ll, l.to.building.ll] : null;

/** Fills one marker's inner element. DOM, not React: MapLibre owns where it sits. */
function paintPin(inner: HTMLElement, p: MapPin) {
  inner.className = [s.pin, p.ghost ? s.ghost : ""].filter(Boolean).join(" ");
  inner.style.setProperty("--pin", p.ghost ? GOLD : p.colors.length === 1 ? p.colors[0] : NAVY);
  inner.setAttribute(
    "aria-label",
    `${p.building.n}${p.ghost ? " (preview)" : ""}: ${p.courses.join(", ")}`,
  );
  inner.title = `${p.building.n}${p.building.m ? ` (${p.building.m})` : ""} — ${p.courses.join(", ")}`;

  const body = document.createElement("div");
  body.className = s.body;
  if (p.badges.length) {
    for (const b of p.badges) {
      const n = document.createElement("span");
      n.className = s.num;
      n.style.background = b.color;
      n.textContent = b.label;
      body.appendChild(n);
    }
  } else if (!p.ghost) {
    for (const c of p.colors.slice(0, 4)) {
      const d = document.createElement("span");
      d.className = s.dot;
      d.style.background = c;
      body.appendChild(d);
    }
  }
  const label = document.createElement("span");
  label.textContent = p.ghost ? `${p.code} · preview` : p.code;
  body.appendChild(label);

  const tail = document.createElement("div");
  tail.className = s.tail;
  inner.replaceChildren(body, tail);
}

type Marker = {
  marker: maplibregl.Marker;
  el: HTMLDivElement;
  inner: HTMLDivElement;
  code: string;
  /** Stacking when not hovered: previews over numbered stops over plain pins. */
  base: string;
};

export default function CampusMap(props: {
  darkMode: boolean;
  pins: MapPin[];
  /** The selected day's walks; empty for the week view. */
  legs: Leg[];
  /** A building to pick out — hovered here, in the list, or on the calendar. */
  hot: string | null;
  /** The building chosen in the list, to fly to. */
  selected: string | null;
  /** Changes whenever the view should re-frame its pins. */
  fitKey: string;
  onHover: (code: string | null) => void;
  onSelect: (code: string | null) => void;
}) {
  const { darkMode, pins, legs, hot, selected, fitKey } = props;
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const legLabels = useRef(new Map<string, maplibregl.Marker>());
  const hotSig = useRef(STALE);
  const pinsRef = useRef(pins);
  const cbs = useRef(props);
  const firstDark = useRef(darkMode);
  const shownStyle = useRef("");
  const [styleGen, setStyleGen] = useState(0);
  // This component only ever renders in the browser (next/dynamic, ssr: false),
  // so the check can run once, up front.
  const [drawable] = useState(hasWebGL);

  // Event listeners outlive renders; they read the newest props through here.
  useEffect(() => {
    cbs.current = props;
    pinsRef.current = pins;
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
        zoom: 15.2,
        minZoom: 13.5,
        maxZoom: 19,
        maxBounds: BOUNDS,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
    } catch (err) {
      // WebGL present but refused (a lost context, a GPU blocklist). The list
      // beside the map still says where everything is.
      console.warn("Campus map could not start:", err);
      return;
    }
    shownStyle.current = url;
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("style.load", () => {
      addOverlay(map);
      hotSig.current = STALE;
      setStyleGen((g) => g + 1);
    });
    map.on("click", () => cbs.current.onSelect(null));

    // Light up each class building's own footprint. A tile feature is never one
    // building (see footprint.ts), so the polygons of the loaded tiles are taken
    // apart and the one under each pin kept. That needs the deepest tiles, so a
    // pin is only looked up once the map is zoomed in that far; what it found is
    // remembered, and the signature stops this chasing its own repaint.
    map.on("idle", () => {
      const src = map.getSource("ucsd-hot") as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      const pins = pinsRef.current.filter((p) => !p.ghost);
      const todo = pins.filter((p) => !footprints.has(p.code));
      const tiles = buildingSource(map);
      if (tiles && todo.length && map.getZoom() >= tiles.tileZoom) {
        const pieces = map
          .querySourceFeatures(tiles.source, { sourceLayer: "building" })
          .flatMap((f) => polygonsOf(f.geometry))
          .map(toPiece);
        const view = map.getBounds();
        for (const p of todo) {
          const at = toLngLat(p.building.ll);
          const fp = footprintAt(at, pieces, tiles.tileZoom);
          // A miss only counts once the pin is on screen, where its tile is loaded.
          if (fp || view.contains(at)) footprints.set(p.code, fp);
        }
      }
      const drawn = new Set<string>();
      const feats: GeoJSON.Feature[] = [];
      const sig: string[] = [];
      for (const p of pins) {
        const fp = footprints.get(p.code);
        if (!fp) continue;
        // Ledden Auditorium is inside HSS: one building, filled once.
        const where = fp.parts[0][0][0].join(",");
        if (drawn.has(where)) continue;
        drawn.add(where);
        const color = p.colors.length === 1 ? p.colors[0] : NAVY;
        sig.push(`${p.code}:${color}`);
        feats.push(...footprintFeatures(fp, color));
      }
      if (sig.join("|") === hotSig.current) return;
      hotSig.current = sig.join("|");
      src.setData({ type: "FeatureCollection", features: feats });
    });

    mapRef.current = map;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container);
    const pinMarkers = markers.current;
    const labelMarkers = legLabels.current;
    return () => {
      ro.disconnect();
      pinMarkers.clear();
      labelMarkers.clear();
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
    // Markers are DOM and survive; the overlay layers are re-added on style.load.
    map.setStyle(url);
  }, [darkMode]);

  // ── Pins ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const want = new Map(pins.map((p) => [`${p.ghost ? "ghost:" : ""}${p.code}`, p]));
    for (const [key, m] of markers.current) {
      if (!want.has(key)) {
        m.marker.remove();
        markers.current.delete(key);
      }
    }
    for (const [key, p] of want) {
      let m = markers.current.get(key);
      if (!m) {
        const el = document.createElement("div");
        const inner = document.createElement("div");
        inner.tabIndex = p.ghost ? -1 : 0;
        inner.setAttribute("role", "button");
        const code = p.code;
        inner.addEventListener("mouseenter", () => cbs.current.onHover(code));
        inner.addEventListener("mouseleave", () => cbs.current.onHover(null));
        inner.addEventListener("focus", () => cbs.current.onHover(code));
        inner.addEventListener("blur", () => cbs.current.onHover(null));
        inner.addEventListener("click", (e) => {
          e.stopPropagation();
          cbs.current.onSelect(code);
        });
        inner.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            cbs.current.onSelect(code);
          }
        });
        el.appendChild(inner);
        const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat(toLngLat(p.building.ll))
          .addTo(map);
        m = { marker, el, inner, code, base: "1" };
        markers.current.set(key, m);
      }
      m.marker.setLngLat(toLngLat(p.building.ll));
      paintPin(m.inner, p);
      m.base = p.ghost ? "4" : p.badges.length ? "2" : "1";
      m.el.style.zIndex = m.base;
    }
    hotSig.current = STALE;
    map.triggerRepaint();
  }, [pins]);

  // ── Hover ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    for (const m of markers.current.values()) {
      const on = hot != null && m.code === hot;
      m.inner.classList.toggle(s.hot, on);
      m.el.style.zIndex = on ? "5" : m.base;
    }
  }, [hot, pins]);

  // ── Walks ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("ucsd-legs") as maplibregl.GeoJSONSource | undefined;
    const drawn = legs.filter((l) => l.walk && l.status !== "same" && l.status !== "clash");

    src?.setData({
      type: "FeatureCollection",
      features: drawn.flatMap((l) => {
        const path = legPath(l);
        return path
          ? [{
              type: "Feature" as const,
              properties: {
                color: legColor(l.status, darkMode),
                casing: darkMode ? "#0b1220" : "#ffffff",
                source: l.source,
              },
              geometry: { type: "LineString" as const, coordinates: path.map(toLngLat) },
            }]
          : [];
      }),
    });

    // Minute labels halfway along each walk.
    for (const m of legLabels.current.values()) m.remove();
    legLabels.current.clear();
    for (const l of drawn) {
      const path = legPath(l);
      if (!path || !l.walk) continue;
      const el = document.createElement("div");
      const pill = document.createElement("div");
      pill.className = s.leg;
      pill.style.setProperty("--leg", legColor(l.status, darkMode));
      pill.textContent = `${l.walk.minutes} min${l.status === "late" ? " · late" : l.status === "tight" ? " · tight" : ""}`;
      el.appendChild(pill);
      const key = `${l.from.event.key}>${l.to.event.key}`;
      legLabels.current.set(
        key,
        new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(toLngLat(midpoint(path))).addTo(map),
      );
    }
  }, [legs, darkMode, styleGen]);

  // ── Framing ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pts: LatLng[] = pinsRef.current.filter((p) => !p.ghost).map((p) => p.building.ll);
    const duration = reducedMotion() ? 0 : 700;
    if (!pts.length) {
      map.easeTo({ center: CENTER, zoom: 15.2, duration });
      return;
    }
    if (pts.length === 1) {
      map.easeTo({ center: toLngLat(pts[0]), zoom: 16.8, duration });
      return;
    }
    const b = new maplibregl.LngLatBounds(toLngLat(pts[0]), toLngLat(pts[0]));
    for (const p of pts) b.extend(toLngLat(p));
    map.fitBounds(b, { padding: { top: 56, bottom: 40, left: 40, right: 40 }, maxZoom: 17.2, duration });
  }, [fitKey]);

  useEffect(() => {
    const map = mapRef.current;
    const p = pinsRef.current.find((x) => x.code === selected && !x.ghost);
    if (!map || !p) return;
    map.easeTo({
      center: toLngLat(p.building.ll),
      zoom: Math.max(map.getZoom(), 17),
      duration: reducedMotion() ? 0 : 600,
    });
  }, [selected]);

  if (!drawable) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-100 p-6 text-center text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
        This browser cannot draw the map (WebGL is off). The list below still says where
        every class meets, with walking directions.
      </div>
    );
  }

  return <div ref={box} className="h-full w-full" aria-label="Campus map of your classes" role="region" />;
}

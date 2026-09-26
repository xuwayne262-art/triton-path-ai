/**
 * One building's footprint, cut out of the map's own vector tiles.
 *
 * The campus map fills the building each class meets in. It used to take the
 * tile feature under the pin and fill it whole — but OpenFreeMap's tiles do not
 * hold one feature per building. To keep them small, a z14 tile merges every
 * building that shares a height into ONE MultiPolygon (1,384 buildings in the
 * tile that holds most of campus), and a z13 tile fuses neighbouring buildings
 * into blobs. Filling "the feature under HSS" lit up most of the university
 * and a good part of La Jolla.
 *
 * So the feature is taken apart here, and only the polygon the pin stands in
 * is kept. A tile also carries a margin of its neighbours' ground, so a
 * building near a tile edge arrives in two overlapping pieces; each piece is
 * clipped to its own tile and the building is stitched back from the parts,
 * which keeps the fill even and the outline free of a seam.
 */

/** [longitude, latitude] — GeoJSON order. */
export type LngLat = [number, number];
export type Ring = LngLat[];
/** Outer ring first, then any holes (a courtyard). */
export type Polygon = Ring[];

export interface Footprint {
  /** Polygons to fill — usually one, two when a tile edge cut the building. */
  parts: Polygon[];
  /** The building's outline, without the seams where parts meet. */
  outline: LngLat[][];
}

/** A polygon with its bounding box, so most of a tile can be skipped cheaply. */
export interface Piece {
  poly: Polygon;
  /** [west, south, east, north] of the outer ring. */
  box: [number, number, number, number];
}

/**
 * How far a pin may sit from a building's outline and still name it. UCSD's
 * coordinate is usually inside the footprint (69 of this term's 71 buildings);
 * HSS's sits 8 m outside it, at the door.
 */
export const MAX_PIN_OFFSET_M = 20;

// ── Geometry, on a local flat plane — plenty for one campus ──────────────────

const M_PER_DEG_LAT = 110_574;
const mPerDegLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

/** Every polygon in a GeoJSON geometry; anything that is not an area is none. */
export function polygonsOf(g: GeoJSON.Geometry | null | undefined): Polygon[] {
  if (!g) return [];
  if (g.type === "Polygon") return [g.coordinates as Polygon];
  if (g.type === "MultiPolygon") return g.coordinates as Polygon[];
  return [];
}

export function toPiece(poly: Polygon): Piece {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of poly[0] ?? []) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return { poly, box: [w, s, e, n] };
}

/** Ray casting; a point on the edge may land either side, which is fine here. */
export function inRing(pt: LngLat, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring. A pin in a courtyard is still at that building. */
const standsIn = (pt: LngLat, p: Piece) =>
  pt[0] >= p.box[0] && pt[0] <= p.box[2] && pt[1] >= p.box[1] && pt[1] <= p.box[3] && inRing(pt, p.poly[0]);

/** Metres from a point to the nearest edge of a polygon; 0 inside it. */
export function metersToPolygon(pt: LngLat, poly: Polygon): number {
  if (poly[0] && inRing(pt, poly[0])) return 0;
  const kx = mPerDegLng(pt[1]);
  let best = Infinity;
  for (const ring of poly) {
    for (let i = 0; i + 1 < ring.length; i++) {
      const ax = (ring[i][0] - pt[0]) * kx, ay = (ring[i][1] - pt[1]) * M_PER_DEG_LAT;
      const bx = (ring[i + 1][0] - pt[0]) * kx, by = (ring[i + 1][1] - pt[1]) * M_PER_DEG_LAT;
      const dx = bx - ax, dy = by - ay;
      const len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}

/** Square metres, holes subtracted. */
export function areaOf(poly: Polygon): number {
  const lat = poly[0]?.[0]?.[1] ?? 0;
  const k = mPerDegLng(lat) * M_PER_DEG_LAT;
  const ringArea = (r: Ring) => {
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
    return Math.abs(a / 2) * k;
  };
  return poly.reduce((sum, r, i) => sum + (i === 0 ? ringArea(r) : -ringArea(r)), 0);
}

// ── Tiles ────────────────────────────────────────────────────────────────────

export interface Tile { x: number; y: number }
/** [west, south, east, north] */
export type Box = [number, number, number, number];

/** The z/x/y tile holding a point — the same scheme every web map uses. */
export function tileOf([lng, lat]: LngLat, z: number): Tile {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return {
    x: Math.floor(((lng + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n),
  };
}

export function tileBox({ x, y }: Tile, z: number): Box {
  const n = 2 ** z;
  const lng = (i: number) => (i / n) * 360 - 180;
  const lat = (j: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * j) / n))) * 180) / Math.PI;
  return [lng(x), lat(y + 1), lng(x + 1), lat(y)];
}

type Side = "w" | "s" | "e" | "n";
const SIDES: Side[] = ["w", "s", "e", "n"];
const across: Record<Side, Tile> = { w: { x: -1, y: 0 }, e: { x: 1, y: 0 }, n: { x: 0, y: -1 }, s: { x: 0, y: 1 } };
const neighbour = (t: Tile, side: Side): Tile => ({ x: t.x + across[side].x, y: t.y + across[side].y });
const tileKey = (t: Tile) => `${t.x}/${t.y}`;

/** Which coordinate a side fixes, and where. */
function sideLine(box: Box, side: Side): { axis: 0 | 1; at: number } {
  if (side === "w") return { axis: 0, at: box[0] };
  if (side === "e") return { axis: 0, at: box[2] };
  if (side === "s") return { axis: 1, at: box[1] };
  return { axis: 1, at: box[3] };
}

const EPS = 1e-9;
const onSide = (p: LngLat, box: Box, side: Side) => {
  const { axis, at } = sideLine(box, side);
  return Math.abs(p[axis] - at) < EPS;
};

/**
 * Sutherland–Hodgman against one axis-aligned box. A tile's edges are lines of
 * constant longitude and latitude, so they are straight in these coordinates.
 */
function clipRing(ring: Ring, box: Box): Ring {
  let out = ring[0] && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring.slice();
  for (const side of SIDES) {
    if (!out.length) break;
    const { axis, at } = sideLine(box, side);
    const keep = (p: LngLat) => (side === "w" || side === "s" ? p[axis] >= at : p[axis] <= at);
    const cross = (a: LngLat, b: LngLat): LngLat => {
      const t = (at - a[axis]) / (b[axis] - a[axis]);
      const p: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      p[axis] = at; // exactly on the line, so parts from two tiles meet exactly
      return p;
    };
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      if (keep(cur)) {
        if (!keep(prev)) out.push(cross(prev, cur));
        out.push(cur);
      } else if (keep(prev)) {
        out.push(cross(prev, cur));
      }
    }
  }
  return out.length >= 3 ? [...out, out[0]] : [];
}

export function clipToBox(poly: Polygon, box: Box): Polygon | null {
  const outer = clipRing(poly[0] ?? [], box);
  if (!outer.length) return null;
  const holes = poly.slice(1).map((r) => clipRing(r, box)).filter((r) => r.length);
  return [outer, ...holes];
}

/** Where the part runs along a side: the midpoint of its longest stretch there. */
function runAlong(ring: Ring, box: Box, side: Side): LngLat | null {
  let best: LngLat | null = null;
  let bestLen = 0;
  for (let i = 0; i + 1 < ring.length; i++) {
    const a = ring[i], b = ring[i + 1];
    if (!onSide(a, box, side) || !onSide(b, box, side)) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > bestLen) {
      bestLen = len;
      best = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    }
  }
  return best;
}

/** A metre or so across a side, into the neighbouring tile. */
function nudge(p: LngLat, side: Side): LngLat {
  const d = 1e-5;
  if (side === "w") return [p[0] - d, p[1]];
  if (side === "e") return [p[0] + d, p[1]];
  if (side === "s") return [p[0], p[1] - d];
  return [p[0], p[1] + d];
}

function largest(polys: Polygon[]): Polygon | null {
  let best: Polygon | null = null;
  let bestArea = -1;
  for (const p of polys) {
    const a = areaOf(p);
    if (a > bestArea) { bestArea = a; best = p; }
  }
  return best;
}

/** The ring's segments, minus any lying on one of the given sides of the box. */
function openOutline(ring: Ring, box: Box, seams: Side[]): LngLat[][] {
  const seam = (a: LngLat, b: LngLat) => seams.some((s) => onSide(a, box, s) && onSide(b, box, s));
  const lines: LngLat[][] = [];
  let line: LngLat[] = [];
  for (let i = 0; i + 1 < ring.length; i++) {
    const a = ring[i], b = ring[i + 1];
    if (seam(a, b)) {
      if (line.length > 1) lines.push(line);
      line = [];
      continue;
    }
    if (!line.length) line.push(a);
    line.push(b);
  }
  if (line.length > 1) lines.push(line);
  // A ring that starts mid-way along the outline splits it in two; rejoin them.
  if (lines.length > 1) {
    const first = lines[0], last = lines[lines.length - 1];
    const [fx, fy] = first[0], [lx, ly] = last[last.length - 1];
    if (fx === lx && fy === ly) {
      lines[0] = [...last, ...first.slice(1)];
      lines.pop();
    }
  }
  return lines;
}

/** A point just inside `poly`, on the side facing `from`. */
function pointInsideFacing(poly: Polygon, from: LngLat): LngLat | null {
  const kx = mPerDegLng(from[1]);
  const ring = poly[0];
  let best: LngLat | null = null;
  let bestD = Infinity;
  for (let i = 0; i + 1 < ring.length; i++) {
    const ax = (ring[i][0] - from[0]) * kx, ay = (ring[i][1] - from[1]) * M_PER_DEG_LAT;
    const bx = (ring[i + 1][0] - from[0]) * kx, by = (ring[i + 1][1] - from[1]) * M_PER_DEG_LAT;
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    const qx = ax + t * dx, qy = ay + t * dy;
    const d = Math.hypot(qx, qy);
    if (d < bestD) {
      bestD = d;
      // Carry on past the wall, away from where we stand: that is indoors.
      const step = d > 0 ? 0.75 / d : 0;
      best = [from[0] + (qx * (1 + step)) / kx, from[1] + (qy * (1 + step)) / M_PER_DEG_LAT];
    }
  }
  const inside = (p: LngLat | null) => p && inRing(p, ring) && !poly.slice(1).some((h) => inRing(p, h));
  if (inside(best)) return best;
  const n = ring.length - 1;
  const mid: LngLat = [ring.slice(0, n).reduce((a, p) => a + p[0], 0) / n, ring.slice(0, n).reduce((a, p) => a + p[1], 0) / n];
  return inside(mid) ? mid : null;
}

/**
 * Where to start when the pin stands in no building. UCSD pins some buildings
 * at the door, and some complexes in the courtyard their wings surround: HSS's
 * pin has four wings within 20 m, and the one OpenStreetMap actually names
 * "Humanities & Social Sciences" is not the nearest. So every building about as
 * near as the nearest one is kept — twice its distance, plus a metre — which
 * takes in a ring of wings but not the building across the walkway from a door.
 */
function doorsteps(pin: LngLat, pieces: Piece[]): LngLat[] {
  const reach = MAX_PIN_OFFSET_M / M_PER_DEG_LAT;
  const reachLng = MAX_PIN_OFFSET_M / mPerDegLng(pin[1]);
  const near: { p: Piece; d: number }[] = [];
  for (const p of pieces) {
    const [w, s, e, n] = p.box;
    if (pin[0] < w - reachLng || pin[0] > e + reachLng || pin[1] < s - reach || pin[1] > n + reach) continue;
    const d = metersToPolygon(pin, p.poly);
    if (d <= MAX_PIN_OFFSET_M) near.push({ p, d });
  }
  if (!near.length) return [];
  const nearest = Math.min(...near.map((x) => x.d));
  const limit = Math.min(MAX_PIN_OFFSET_M, nearest * 2 + 1);
  return near
    .filter((x) => x.d <= limit)
    .sort((a, b) => a.d - b.d)
    .map((x) => pointInsideFacing(x.p.poly, pin))
    .filter((p): p is LngLat => p !== null);
}

/**
 * The footprint of the building at `pin`, from the building polygons of the
 * z-level tiles currently loaded. Null when no building is near enough — a
 * missing highlight is honest; the wrong one is not.
 */
export function footprintAt(pin: LngLat, pieces: Piece[], z: number): Footprint | null {
  const starts = pieces.some((p) => standsIn(pin, p)) ? [pin] : doorsteps(pin, pieces);
  const parts: Polygon[] = [];
  const outline: LngLat[][] = [];
  for (const start of starts) {
    // Tiles overlap, so a building near an edge comes in two copies; the copy
    // already drawn from another start is the same building.
    if (parts.some((p) => inRing(start, p[0]))) continue;
    const b = buildingAt(start, pieces, z);
    if (!b) continue;
    parts.push(...b.parts);
    outline.push(...b.outline);
  }
  return parts.length ? { parts, outline } : null;
}

/** The one building containing `at`, stitched across any tile edge it crosses. */
function buildingAt(at: LngLat, pieces: Piece[], z: number): Footprint | null {
  const found = pieces.filter((p) => standsIn(at, p));
  if (!found.length) return null;

  // The building's share of each tile it crosses. A piece reaches past its own
  // tile, so clipping every candidate to the tile and keeping the largest gives
  // that tile's own copy — never the neighbour's narrow overhang.
  const parts: { tile: Tile; box: Box; poly: Polygon }[] = [];
  const seen = new Set<string>();
  const queue: { tile: Tile; candidates: Piece[] }[] = [{ tile: tileOf(at, z), candidates: found }];
  while (queue.length && parts.length < 4) {
    const { tile, candidates } = queue.shift()!;
    if (seen.has(tileKey(tile))) continue;
    seen.add(tileKey(tile));
    const box = tileBox(tile, z);
    const part = largest(candidates.map((c) => clipToBox(c.poly, box)).filter((p): p is Polygon => p !== null));
    if (!part) continue;
    parts.push({ tile, box, poly: part });

    // Where the share runs along the tile's edge and the building carried on
    // past it, the rest is next door.
    for (const side of SIDES) {
      const next = neighbour(tile, side);
      if (seen.has(tileKey(next))) continue;
      const { axis, at: edge } = sideLine(box, side);
      const beyond = (p: LngLat) => (side === "w" || side === "s" ? p[axis] < edge - EPS : p[axis] > edge + EPS);
      if (!candidates.some((c) => c.poly[0].some(beyond))) continue;
      const mid = runAlong(part[0], box, side);
      if (!mid) continue;
      const probe = nudge(mid, side);
      const over = pieces.filter((p) => standsIn(probe, p));
      if (over.length) queue.push({ tile: next, candidates: over });
    }
  }
  if (!parts.length) return null;

  const outline: LngLat[][] = [];
  for (const part of parts) {
    const seams = SIDES.filter((s) => parts.some((o) => tileKey(o.tile) === tileKey(neighbour(part.tile, s))));
    for (const ring of part.poly) outline.push(...openOutline(ring, part.box, seams));
  }
  return { parts: parts.map((p) => p.poly), outline };
}

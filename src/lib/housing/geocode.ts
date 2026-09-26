import type { LatLng } from "@/lib/campus";

/**
 * Turning an address into a point on the map.
 *
 * The geocoder is the U.S. Census Bureau's: no key, no usage fee, and its
 * results are public-domain government data, so a student's address can be
 * placed without sending it to an ad company or agreeing to terms that forbid
 * storing the answer. It knows street addresses, not place names — "Costa
 * Verde Village" finds nothing, "8750 Costa Verde Blvd" finds the building —
 * which is exactly what a rental listing has anyway.
 */

export const CENSUS_GEOCODER =
  "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

/**
 * Where a UCSD student might plausibly live: Oceanside to Chula Vista, the
 * coast to El Cajon. A match outside this is a different "Nobel Drive".
 */
const BOUNDS = { south: 32.53, north: 33.25, west: -117.6, east: -116.85 };

export const inSanDiego = ([lat, lng]: LatLng) =>
  lat >= BOUNDS.south && lat <= BOUNDS.north && lng >= BOUNDS.west && lng <= BOUNDS.east;

const MAX_QUERY = 160;

export type AddressQuery = { ok: true; address: string } | { ok: false; error: string };

/**
 * What to ask the geocoder. A bare street address gets "San Diego, CA"
 * appended, since that is what a student here means by it; one that names a
 * city gets the state. Anything that cannot be an address is refused before a
 * request is made.
 */
export function parseAddressQuery(raw: string | null | undefined): AddressQuery {
  const q = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (q.length < 5) return { ok: false, error: "Type a street address, like 3990 Nobel Dr." };
  if (q.length > MAX_QUERY) return { ok: false, error: "That address is too long." };
  if (!/^[\p{L}\p{N} ,.#'&/-]+$/u.test(q)) {
    return { ok: false, error: "An address only needs letters, numbers and , . # -" };
  }
  if (!/\d/.test(q) || !/\p{L}/u.test(q)) {
    return { ok: false, error: "Include the street number, like 3990 Nobel Dr." };
  }
  const hasState = /\b(CA|California)\b/i.test(q) || /\b9\d{4}\b/.test(q);
  const address = hasState ? q : q.includes(",") ? `${q}, CA` : `${q}, San Diego, CA`;
  return { ok: true, address };
}

export function geocoderUrl(address: string): string {
  const p = new URLSearchParams({ address, benchmark: "Public_AR_Current", format: "json" });
  return `${CENSUS_GEOCODER}?${p.toString()}`;
}

export interface Place {
  /** "3990 Nobel Dr, San Diego, CA 92122" */
  address: string;
  ll: LatLng;
  zip: string;
  /** "University City" */
  area: string;
}

/**
 * Neighbourhoods by ZIP, for the ones UCSD students actually rent in. The
 * Census answer names only the city, and "San Diego" says nothing about
 * whether a place is next to campus or twenty minutes down the I-5.
 */
export const AREA_BY_ZIP: Record<string, string> = {
  "92093": "UC San Diego",
  "92037": "La Jolla",
  "92122": "University City",
  "92161": "University City",
  "92121": "Sorrento Valley",
  "92130": "Carmel Valley",
  "92014": "Del Mar",
  "92075": "Solana Beach",
  "92109": "Pacific Beach",
  "92117": "Clairemont",
  "92111": "Linda Vista",
  "92110": "Bay Park",
  "92123": "Serra Mesa",
  "92126": "Mira Mesa",
  "92131": "Scripps Ranch",
  "92129": "Rancho Peñasquitos",
  "92124": "Tierrasanta",
  "92108": "Mission Valley",
  "92103": "Hillcrest",
  "92104": "North Park",
  "92116": "Normal Heights",
  "92101": "Downtown",
  "92107": "Ocean Beach",
  "92106": "Point Loma",
  "92115": "College Area",
};

const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b([a-z])([a-z']*)/g, (_, a: string, b: string) => a.toUpperCase() + b);

/** "3990 NOBEL DR, SAN DIEGO, CA, 92122" -> "3990 Nobel Dr, San Diego, CA 92122" */
export function prettyAddress(matched: string): string {
  const parts = matched.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return titleCase(matched);
  const zip = /^\d{5}$/.test(parts[parts.length - 1]) ? parts.pop()! : "";
  const state = parts.pop()!.toUpperCase();
  const rest = parts.map(titleCase).join(", ");
  return `${rest}, ${state}${zip ? ` ${zip}` : ""}`;
}

/** The neighbourhood for an address, from its ZIP, else its city. */
export function areaForAddress(address: string): string {
  const zip = /\b(9\d{4})\b(?!.*\b9\d{4}\b)/.exec(address)?.[1];
  if (zip && AREA_BY_ZIP[zip]) return AREA_BY_ZIP[zip];
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  // "street, city, CA 92122": the city is the part before the state.
  const stateAt = parts.findIndex((p) => /^(CA|California)\b/i.test(p));
  const city = stateAt > 0 ? parts[stateAt - 1] : parts.length >= 2 ? parts[1] : "";
  return titleCase(city).slice(0, 40) || "San Diego";
}

/**
 * The matches worth offering, from the geocoder's JSON. Anything malformed or
 * outside San Diego is dropped rather than trusted.
 */
export function shapePlaces(json: unknown): Place[] {
  const matches = (json as { result?: { addressMatches?: unknown } })?.result?.addressMatches;
  if (!Array.isArray(matches)) return [];
  const out: Place[] = [];
  for (const m of matches.slice(0, 5)) {
    const x = (m as { coordinates?: { x?: unknown } })?.coordinates?.x;
    const y = (m as { coordinates?: { y?: unknown } })?.coordinates?.y;
    const matched = (m as { matchedAddress?: unknown })?.matchedAddress;
    if (typeof x !== "number" || typeof y !== "number" || typeof matched !== "string") continue;
    const ll: LatLng = [Math.round(y * 1e6) / 1e6, Math.round(x * 1e6) / 1e6];
    if (!inSanDiego(ll)) continue;
    const address = prettyAddress(matched);
    const zip = /\b(\d{5})$/.exec(address)?.[1] ?? "";
    out.push({ address, ll, zip, area: areaForAddress(address) });
  }
  return out;
}

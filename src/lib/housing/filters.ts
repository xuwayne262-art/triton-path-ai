/**
 * The housing board's filters, and how they are written into the address bar
 * so that Back, a reload and a shared link all show the same board.
 *
 * Nothing in a query string is trusted: an unknown value reads as the default,
 * and a rent cap is snapped onto the slider's scale.
 */

export type Space = "any" | "private" | "shared" | "whole";
export type Sort = "commute" | "rent" | "newest";

export const SPACES: Record<Space, string> = {
  any: "Any space",
  private: "Private room",
  shared: "Shared room",
  whole: "Whole place",
};

/** The rent slider's scale, in dollars a month. Its top stop means no cap. */
export const RENT_RANGE = { min: 500, max: 3000, step: 50 } as const;

export interface BoardFilters {
  /** A quarter key such as "WI27", or "any". */
  quarter: string;
  space: Space;
  /** Dollars a month; null is no cap. */
  rentCap: number | null;
  sort: Sort;
}

export const NO_FILTERS: BoardFilters = { quarter: "any", space: "any", rentCap: null, sort: "commute" };

const isSpace = (v: string | null): v is Space => v === "any" || v === "private" || v === "shared" || v === "whole";
const isSort = (v: string | null): v is Sort => v === "commute" || v === "rent" || v === "newest";

/** A cap from the address bar, snapped to the nearest stop; at or past the top it is no cap at all. */
function readCap(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  const { min, max, step } = RENT_RANGE;
  if (!Number.isFinite(n) || n >= max) return null;
  return Math.min(max - step, Math.max(min, min + Math.round((n - min) / step) * step));
}

/** Filters from a query string ("?quarter=WI27&max=1200" or without the "?"). */
export function readFilters(query: string, quarterKeys: readonly string[]): BoardFilters {
  const p = new URLSearchParams(query);
  const quarter = p.get("quarter");
  const space = p.get("space");
  const sort = p.get("sort");
  return {
    quarter: quarter !== null && quarterKeys.includes(quarter) ? quarter : "any",
    space: isSpace(space) ? space : "any",
    rentCap: readCap(p.get("max")),
    sort: isSort(sort) ? sort : "commute",
  };
}

/** The same filters as a query string, leaving out whatever is at its default. */
export function writeFilters(f: BoardFilters): string {
  const p = new URLSearchParams();
  if (f.quarter !== "any") p.set("quarter", f.quarter);
  if (f.space !== "any") p.set("space", f.space);
  if (f.rentCap !== null) p.set("max", String(f.rentCap));
  if (f.sort !== "commute") p.set("sort", f.sort);
  return p.toString();
}

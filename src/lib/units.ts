/**
 * A course's units, as UCSD states them, without rounding a choice away.
 *
 * Class Planner and the catalog write units as "4", "2.5", "1-4" (any whole
 * number in the range), "0-2-4" (one of those), and for a sequence taken over
 * several quarters "4-4-4" or "0-4/0-4/0-4" (that much each quarter). A topics
 * or independent-study course can also carry the real choice only in its
 * title: ECON 199 arrives as "2" units and the title "Independent Study (2 or
 * 4)". `parseFloat` read every one of those as its first number, so a student
 * planning ECON 199 at 4 units saw 2, and "1-4" became a fixed 1.
 */

export interface Units {
  min: number;
  max: number;
  /** The exact values allowed, when UCSD lists them ("2 or 4"); null for "any whole number in min–max". */
  options: number[] | null;
}

const NUM = String.raw`\d+(?:\.\d+)?`;

/** "(2 or 4)", "(1–4)", "(4)" at the end of a title. */
const TITLE_UNITS = new RegExp(String.raw`\((${NUM}(?:\s*(?:or|,|-|–|to)\s*${NUM})*)\)\s*$`, "i");

function fromText(text: string): Units | null {
  const t = text.trim();
  if (!t) return null;
  // A sequence over several quarters: each quarter's share is what a plan adds.
  const quarter = t.split("/")[0];
  const parts = quarter.split(/\s*(?:or|,|-|–|to)\s*/i).map(Number).filter((n) => Number.isFinite(n));
  if (!parts.length || parts.some((n) => n < 0 || n > 30)) return null;
  const distinct = [...new Set(parts)].sort((a, b) => a - b);
  const min = distinct[0];
  const max = distinct[distinct.length - 1];
  if (distinct.length === 1) return { min, max, options: [min] };
  // "1-4" is a range; "0-2-4" and "2 or 4" list the values allowed.
  const isRange = parts.length === 2 && /-|–|to/.test(quarter) && !/or|,/i.test(quarter);
  return { min, max, options: isRange ? null : distinct };
}

/** The units of a course, from its units field and, where that hides a choice, its title. */
export function parseUnits(u: string | null | undefined, title?: string | null): Units | null {
  const field = u ? fromText(u) : null;
  const m = title ? TITLE_UNITS.exec(title) : null;
  const named = m ? fromText(m[1]) : null;
  // The title wins only when it widens the field into a choice that includes it.
  if (named && named.max > named.min && (!field || (field.min >= named.min && field.max <= named.max))) return named;
  return field ?? named;
}

export const isVariable = (u: Units | null): boolean => Boolean(u && u.max > u.min);

const fmt = (n: number) => String(Number(n.toFixed(2)));

/** "4", "2 or 4", "1–4", "0, 2 or 4". */
export function unitsText(u: Units | null): string {
  if (!u) return "";
  if (u.min === u.max) return fmt(u.min);
  if (!u.options) return `${fmt(u.min)}–${fmt(u.max)}`;
  const opts = u.options.map(fmt);
  return opts.length === 2 ? opts.join(" or ") : `${opts.slice(0, -1).join(", ")} or ${opts[opts.length - 1]}`;
}

/** "4 units", "1 unit", "2 or 4 units", "Units not listed". */
export function unitsLabel(u: string | null | undefined, title?: string | null): string {
  const parsed = parseUnits(u, title);
  if (!parsed) return "Units not listed";
  return `${unitsText(parsed)} ${parsed.min === 1 && parsed.max === 1 ? "unit" : "units"}`;
}

/** A total over several courses, as a range when any of them is still a choice. */
export function unitsTotal(list: (Units | null)[]): { min: number; max: number; text: string } {
  let min = 0;
  let max = 0;
  for (const u of list) {
    if (!u) continue;
    min += u.min;
    max += u.max;
  }
  const text = min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
  return { min, max, text };
}

/** A planner course's units: "4", or "2–4" when the student still chooses. */
export function courseUnitsText(c: { units: number; unitsMax?: number }): string {
  return c.unitsMax != null && c.unitsMax > c.units ? `${fmt(c.units)}–${fmt(c.unitsMax)}` : fmt(c.units);
}

/** The total of several planner courses: "12", or "12–14" while any is a choice. */
export function coursesUnitsText(list: { units: number; unitsMax?: number }[]): string {
  const min = list.reduce((n, c) => n + c.units, 0);
  const max = list.reduce((n, c) => n + Math.max(c.units, c.unitsMax ?? c.units), 0);
  return min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
}

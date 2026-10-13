import { prereqKnown, sortCourses, type CourseRow, type SortKey } from "@/lib/plat";

/**
 * The filters every course list shares (a department, the GE lists), kept out
 * of the component so the rules can be tested without rendering anything.
 */

export interface ResultFilters {
  q: string;
  units: string;
  /** Only courses on this term's schedule. Off by default, and switched in plain sight. */
  offeredOnly: boolean;
  openOnly: boolean;
  noPre: boolean;
  hasGrades: boolean;
  /** Ceiling on RateMyProfessors difficulty: "any" | "2.2" | "3.2" | "4". */
  load: string;
  sort: SortKey;
}

/**
 * Every list opens on every course. It used to open on this term's schedule
 * only, with that filter tucked behind the Filters button and no chip to say
 * it was on, so a course that simply is not running this term — CHEM 118 —
 * vanished from its department's list while search still found it.
 */
export const DEFAULT_FILTERS: ResultFilters = {
  q: "",
  units: "any",
  offeredOnly: false,
  openOnly: false,
  noPre: false,
  hasGrades: false,
  load: "any",
  sort: "grade",
};

/**
 * A sorted list cut in two — this term's courses, then the rest — each part
 * keeping the order it came in. Every row stays on the list (nothing is
 * filtered by it), but a student looking for something to take next term no
 * longer reads past retired and not-offered courses to find it: the CSE list
 * opened on CSE 4GS, 5A, 5R, 6GS, 6R and 7, none of them running.
 */
export function splitByTerm(rows: CourseRow[]): { offered: CourseRow[]; other: CourseRow[] } {
  const offered: CourseRow[] = [];
  const other: CourseRow[] = [];
  for (const r of rows) (r.o === 1 ? offered : other).push(r);
  return { offered, other };
}

// ── In a link ───────────────────────────────────────────────────────────────
// A list's filters ride in the address — `?term=1&sort=rating&q=film` — so a
// reload, a shared link and Back all return to the same list. Defaults are
// left out, and anything unreadable falls back to them.

const SORT_KEYS = new Set<SortKey>(["grade", "code", "rating"]);
const UNIT_CAPS = new Set(["1", "2", "3", "4", "5", "6"]);
const LOAD_CAPS = new Set(["2.2", "3.2", "4"]);

/** The filters in a query, over `base` (a page's own defaults, e.g. its sort). */
export function filtersFromQuery(params: { get(name: string): string | null }, base: ResultFilters): ResultFilters {
  const sort = params.get("sort") ?? "";
  const units = params.get("units") ?? "";
  const load = params.get("rmp") ?? "";
  return {
    ...base,
    q: (params.get("q") ?? "").slice(0, 80),
    units: UNIT_CAPS.has(units) ? units : base.units,
    load: LOAD_CAPS.has(load) ? load : base.load,
    offeredOnly: params.get("term") === "1",
    openOnly: params.get("open") === "1",
    noPre: params.get("nopre") === "1",
    hasGrades: params.get("graded") === "1",
    sort: SORT_KEYS.has(sort as SortKey) ? (sort as SortKey) : base.sort,
  };
}

/** Writes what differs from `base` into `q`. */
export function filtersToQuery(f: ResultFilters, base: ResultFilters, q: URLSearchParams): URLSearchParams {
  if (f.q.trim()) q.set("q", f.q.trim());
  if (f.units !== base.units) q.set("units", f.units);
  if (f.load !== base.load) q.set("rmp", f.load);
  if (f.offeredOnly) q.set("term", "1");
  if (f.openOnly) q.set("open", "1");
  if (f.noPre) q.set("nopre", "1");
  if (f.hasGrades) q.set("graded", "1");
  if (f.sort !== base.sort) q.set("sort", f.sort);
  return q;
}

export function applyFilters(rows: CourseRow[], f: ResultFilters): CourseRow[] {
  const q = f.q.trim().toLowerCase();
  const maxUnits = f.units === "any" ? Infinity : Number(f.units);
  const maxLoad = f.load === "any" ? Infinity : Number(f.load);

  const filtered = rows.filter((c) => {
    if (f.offeredOnly && !c.o) return false;
    if (f.openOnly && !(c.sa != null && c.sa > 0)) return false;
    // "No prerequisite" means known to have none, not "nothing on record".
    if (f.noPre && (c.pr || !prereqKnown(c))) return false;
    if (f.hasGrades && !(c.r > 0 && c.g != null && c.g > 0)) return false;
    // Workload comes from the instructor's difficulty score, so a course with
    // no rated instructor cannot answer the question and is filtered out.
    if (maxLoad !== Infinity && !(c.pd != null && c.pd > 0 && c.pd <= maxLoad)) return false;
    if (maxUnits !== Infinity) {
      const u = c.u ? parseFloat(c.u) : null;
      if (u == null || u > maxUnits) return false;
    }
    if (q && !`${c.k} ${c.t} ${c.p ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  return sortCourses(filtered, f.sort);
}

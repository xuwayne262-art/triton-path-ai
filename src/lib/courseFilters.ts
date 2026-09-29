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

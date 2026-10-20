import type { CourseRow, GEFile, PlatIndex } from "./plat";
import { DEFAULT_FILTERS, type ResultFilters } from "./courseFilters";

/** AI selects search criteria; the catalog remains the only source of courses. */
export interface DiscoveryIntent {
  college: string | null;
  area: string | null;
  requirement: "campus:DEI" | "campus:AHI" | null;
  subject: string | null;
  filters: ResultFilters;
  unsupported: string[];
  clarification: string | null;
}

export const EMPTY_DISCOVERY: DiscoveryIntent = {
  college: null, area: null, requirement: null, subject: null,
  filters: { ...DEFAULT_FILTERS }, unsupported: [], clarification: null,
};

/** Reject invented or contradictory scopes instead of silently broadening. */
export function validDiscoveryScope(intent: DiscoveryIntent, index: PlatIndex, ge: GEFile): boolean {
  if (intent.college && !ge.areas.some((a) => a.college !== "campus" && a.college === intent.college)) return false;
  if (intent.area && !ge.areas.some((a) => a.key === intent.area && a.college === intent.college)) return false;
  if (intent.requirement && !ge.lists[intent.requirement]) return false;
  if (intent.subject && !index.subjects.some((s) => s.code === intent.subject)) return false;
  return true;
}

/** Scope first, then CourseResults applies the same editable filters as /ge. */
export function discoveryRows(intent: DiscoveryIntent, index: PlatIndex, ge: GEFile): CourseRow[] {
  if (!validDiscoveryScope(intent, index, ge)) return [];
  let codes: Set<string> | null = null;
  if (intent.college) {
    const keys = intent.area ? [intent.area] : ge.areas.filter((a) => a.college === intent.college).map((a) => a.key);
    codes = new Set(keys.flatMap((key) => ge.lists[key] ?? []));
  }
  const requirement = intent.requirement ? new Set(ge.lists[intent.requirement]) : null;
  return index.courses.filter((row) =>
    (!codes || codes.has(row.k)) && (!requirement || requirement.has(row.k)) &&
    (!intent.subject || row.s === intent.subject));
}

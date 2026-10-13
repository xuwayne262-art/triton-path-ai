/**
 * The GE page's choices, as an address a student can reload, share, or go
 * Back through — and the courses those choices select.
 *
 * The page asks three things in order: which college; which of its GE areas
 * (any number — a course on ANY selected area is listed, and none selected
 * means every area); and, optionally, a university requirement each listed
 * course must ALSO be on (DEI, AHI — an intersection). A university
 * requirement can also be browsed on its own, whatever the college.
 *
 * Everything read from a URL is checked against the GE file itself: a college
 * or area the data does not have is dropped and named in `problems`, so a
 * stale or mistyped link lands on a labelled, safe state instead of silently
 * showing some other college's list.
 */

import {
  CAMPUS, UNIVERSITY_REQUIREMENTS, collegeName, universityRequirement,
  type CourseRow, type GEFile,
} from "./plat";
import { DEFAULT_FILTERS, type ResultFilters } from "./courseFilters";

export interface GeState {
  /** A college key from the GE file ("sixth"), or null until one is chosen. */
  college: string | null;
  /** Area keys of that college ("sixth:Modes of Inquiry · Humanities"); empty means all of them. */
  areas: string[];
  /** A university requirement browsed on its own ("campus:DEI"), whatever the college. */
  req: string | null;
  /** University requirements every listed course must also be on. */
  also: string[];
  /** A Warren discipline id, for Warren's rule-based areas. */
  discipline: string | null;
}

export const EMPTY_GE: GeState = { college: null, areas: [], req: null, also: [], discipline: null };

/** "sixth:Modes of Inquiry · Humanities" -> "modes-of-inquiry-humanities", for the address bar. */
export const areaSlug = (key: string) =>
  key.slice(key.indexOf(":") + 1).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** "campus:DEI" -> "dei". */
const reqSlug = (key: string) => (universityRequirement(key) ?? "").toLowerCase();

const SORTS = new Set(["grade", "code", "rating"]);
const UNITS = new Set(["1", "2", "3", "4", "5", "6"]);
const LOADS = new Set(["2.2", "3.2", "4"]);

export interface ParsedGe {
  state: GeState;
  filters: ResultFilters;
  /** What the URL asked for that the data does not have, in plain words. */
  problems: string[];
}

/** The page's state from its query, checked against the GE file and Warren's disciplines. */
export function parseGeQuery(
  params: { get(name: string): string | null },
  ge: GEFile,
  disciplines: string[],
  base: ResultFilters = { ...DEFAULT_FILTERS, sort: "grade" },
): ParsedGe {
  const problems: string[] = [];
  const colleges = new Set(ge.areas.map((a) => a.college).filter((c) => c !== CAMPUS));
  const reqKeys = Object.keys(UNIVERSITY_REQUIREMENTS).map((k) => `${CAMPUS}:${k}`).filter((k) => ge.lists[k]);
  const reqBySlug = new Map(reqKeys.map((k) => [reqSlug(k), k]));

  const rawCollege = (params.get("college") ?? "").trim().toLowerCase();
  let college: string | null = null;
  if (rawCollege) {
    if (colleges.has(rawCollege)) college = rawCollege;
    else problems.push(`This link names a college the GE lists don’t have (“${rawCollege.slice(0, 24)}”), so choose yours below.`);
  }

  const areas: string[] = [];
  const rawAreas = (params.get("area") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (rawAreas.length) {
    const bySlug = new Map(ge.areas.filter((a) => a.college === college).map((a) => [areaSlug(a.key), a.key]));
    let dropped = 0;
    for (const slug of rawAreas.slice(0, 12)) {
      const key = bySlug.get(slug.toLowerCase());
      if (key && !areas.includes(key)) areas.push(key);
      else if (!key) dropped++;
    }
    if (dropped && college) problems.push(`${dropped === 1 ? "An area" : `${dropped} areas`} in this link ${dropped === 1 ? "isn’t" : "aren’t"} on ${collegeName(college)}’s lists, so ${dropped === 1 ? "it was" : "they were"} left out.`);
  }

  const rawReq = (params.get("req") ?? "").trim().toLowerCase();
  const req = rawReq ? reqBySlug.get(rawReq) ?? null : null;
  if (rawReq && !req) problems.push("This link names a university requirement there is no list for, so it was left out.");

  const also = (params.get("also") ?? "").split(",").map((s) => reqBySlug.get(s.trim().toLowerCase()))
    .filter((k): k is string => Boolean(k) && k !== req)
    .filter((k, i, a) => a.indexOf(k) === i);

  const rawDiscipline = (params.get("d") ?? "").trim();
  const discipline = college === "warren" && disciplines.includes(rawDiscipline) ? rawDiscipline : null;

  const sort = params.get("sort") ?? "";
  const units = params.get("units") ?? "";
  const load = params.get("rmp") ?? "";
  const filters: ResultFilters = {
    ...base,
    q: (params.get("q") ?? "").slice(0, 80),
    units: UNITS.has(units) ? units : base.units,
    load: LOADS.has(load) ? load : base.load,
    offeredOnly: params.get("term") === "1",
    openOnly: params.get("open") === "1",
    noPre: params.get("nopre") === "1",
    hasGrades: params.get("graded") === "1",
    sort: SORTS.has(sort) ? (sort as ResultFilters["sort"]) : base.sort,
  };

  return { state: { college, areas: discipline ? [] : areas, req, also: req ? [] : also, discipline }, filters, problems };
}

/** The query that reproduces a state; defaults are left out, so a plain page has a plain address. */
export function geQueryString(
  state: GeState,
  filters: ResultFilters,
  base: ResultFilters = { ...DEFAULT_FILTERS, sort: "grade" },
): string {
  const q = new URLSearchParams();
  if (state.college) q.set("college", state.college);
  if (state.areas.length) q.set("area", state.areas.map(areaSlug).join(","));
  if (state.req) q.set("req", reqSlug(state.req));
  if (state.also.length) q.set("also", state.also.map(reqSlug).join(","));
  if (state.discipline) q.set("d", state.discipline);
  if (filters.q.trim()) q.set("q", filters.q.trim());
  if (filters.units !== base.units) q.set("units", filters.units);
  if (filters.load !== base.load) q.set("rmp", filters.load);
  if (filters.offeredOnly) q.set("term", "1");
  if (filters.openOnly) q.set("open", "1");
  if (filters.noPre) q.set("nopre", "1");
  if (filters.hasGrades) q.set("graded", "1");
  if (filters.sort !== base.sort) q.set("sort", filters.sort);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export interface GeResults {
  rows: CourseRow[];
  /** Codes on the chosen lists that no UCSD source knows, so nothing ranks them. */
  unknown: string[];
  /** "may count for Humanities · also DEI" for a listed course. */
  noteFor: (row: CourseRow) => string | undefined;
}

/** The courses a state selects: the union of its areas, intersected with every "also". */
export function geResults(
  courses: CourseRow[],
  ge: GEFile,
  state: GeState,
  inDiscipline: (subject: string) => boolean,
): GeResults {
  const listed = (key: string) => new Set(ge.lists[key] ?? []);
  const areaName = (key: string) => key.slice(key.indexOf(":") + 1);
  const reqName = (key: string) => universityRequirement(key) ?? key;

  let codes: Set<string> | null = null;
  let base: CourseRow[];
  let areaKeys: string[] = [];
  if (state.req) {
    codes = listed(state.req);
    base = courses.filter((c) => codes!.has(c.k));
  } else if (state.discipline) {
    base = courses.filter((c) => inDiscipline(c.s));
  } else if (state.college) {
    areaKeys = state.areas.length
      ? state.areas
      : ge.areas.filter((a) => a.college === state.college).map((a) => a.key);
    codes = new Set(areaKeys.flatMap((k) => ge.lists[k] ?? []));
    base = courses.filter((c) => codes!.has(c.k));
  } else {
    base = [];
  }

  const alsoSets = state.also.map((k) => ({ key: k, set: listed(k) }));
  const rows = alsoSets.length ? base.filter((c) => alsoSets.every((a) => a.set.has(c.k))) : base;

  const known = new Set(base.map((c) => c.k));
  const unknown = codes && !alsoSets.length ? [...codes].filter((k) => !known.has(k)).sort() : [];

  const areaSets = areaKeys.map((k) => ({ key: k, set: listed(k) }));
  const noteFor = (row: CourseRow): string | undefined => {
    const parts: string[] = [];
    const hit = areaSets.filter((a) => a.set.has(row.k)).map((a) => areaName(a.key));
    if (hit.length) parts.push(`may count for ${hit.join(", ")}`);
    if (state.req) parts.push(`on the ${reqName(state.req)} list`);
    if (alsoSets.length) parts.push(`also ${alsoSets.map((a) => reqName(a.key)).join(" and ")}`);
    return parts.length ? parts.join(" · ") : undefined;
  };

  return { rows, unknown, noteFor };
}

"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Plus, Search, Sparkles, X } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Course } from "./types";
import AIAuditUploader from "./AIAuditUploader";
import { GradeBadge } from "@/components/plat/Grade";
import { usePref } from "@/components/planner/usePref";
import {
  byPopularity, majorSubjects, platRowToCourse, recommend, requirementCategories,
} from "@/lib/plannerBridge";
import { MAJOR_REQUIREMENTS } from "@/data/requirements";
import { collegeForSubject, departmentForSubject } from "@/data/ucsdStructure";
import { searchCourses, type CourseRow as PlatRow } from "@/lib/plat";

/**
 * Hosted AI answers 503 unconditionally until authentication, eligibility and
 * usage limits exist (see "Hosted AI is turned off" in the README). A tab that
 * asks for a degree audit and then fails is worse than no tab, so the advisor
 * stays out of the rail until that changes — flip this with the server.
 */
const AI_ADVISOR_ENABLED = false;

/** How many courses a requirement lists before "Show more". */
const PER_GROUP = 3;

interface ScheduleCourse {
  course: Course;
  id: string;
}

interface CourseColor {
  bg: string;
  border: string;
  text: string;
  hex: string;
}

interface CourseCatalogProps {
  darkMode: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedCourses: ScheduleCourse[];
  addToSchedule: (course: Course) => void;
  removeFromSchedule: (id: string) => void;
  getColorForCourse: (course: Course) => CourseColor;
  /** Merged { category → targetUnits } from major + minor + college */
  activeRequirements: Record<string, number>;
  selectedMajor: string;
  selectedMinor: string;
  selectedCollege: string | null;
  plannedCourses: Array<{ courseId: string; course: Course }>;
  addAICourseToPlan: (course: Course, year: 1 | 2 | 3 | 4, quarter: "Fall" | "Winter" | "Spring") => void;
  removePlannedCourse: (courseId: string) => void;
  /** The shared UCSDPlans dataset — same courses the explorer shows. */
  platRows: PlatRow[];
  /** Rendered above the catalog so saved courses are the first thing you see. */
  savedPanel?: React.ReactNode;
  legend?: React.ReactNode;
}

const isFlag = (v: string): v is "0" | "1" => v === "0" || v === "1";

/**
 * The Browse side of the rail: find a course and put it on this term.
 *
 * It was a second row of tabs inside the rail's own tabs — Course Catalog,
 * Recommended, AI Advisor — and "Recommended" was a stack of tall cards drawn
 * from a hand-written sample of 57 courses, some not taught this term, each
 * wearing a green "Fulfills" pill. Now it is one list: search, a short
 * "Recommended for you" drawn from what UCSD actually runs this term, then
 * every department. Typing replaces all of it with ranked matches.
 */
export default function CourseCatalog({
  darkMode,
  searchQuery,
  setSearchQuery,
  selectedCourses,
  addToSchedule,
  removeFromSchedule,
  getColorForCourse,
  activeRequirements,
  selectedMajor,
  selectedMinor,
  selectedCollege,
  plannedCourses,
  addAICourseToPlan,
  removePlannedCourse,
  platRows,
  savedPanel,
  legend,
}: CourseCatalogProps) {
  const myDepts = useMemo(() => majorSubjects(selectedMajor), [selectedMajor]);
  const [expandedDepts, setExpandedDepts] = useState<string[]>(() => {
    const first = [...majorSubjects(selectedMajor)][0];
    const dept = first ? departmentForSubject(first) : null;
    return dept ? [dept.name] : [];
  });
  const [recsFlag, setRecsFlag] = usePref<"0" | "1">("ucsdplans-recs-open", "1", isFlag);
  const recsOpen = recsFlag === "1";
  const [moreIn, setMoreIn] = useState<Set<string>>(() => new Set());
  const [advisorOpen, setAdvisorOpen] = useState(false);

  const toggleDept = (name: string) =>
    setExpandedDepts((prev) => (prev.includes(name) ? prev.filter((d) => d !== name) : [...prev, name]));

  const scheduledCodes = useMemo(() => new Set(selectedCourses.map((s) => s.course.code)), [selectedCourses]);
  const byCode = useMemo(() => new Map(platRows.map((r) => [r.k, r])), [platRows]);

  // ── Recommended for you ───────────────────────────────────────────────────
  const collegeSlug = selectedCollege ? selectedCollege.toLowerCase() : null;
  const groups = useMemo(() => {
    // Units the schedule already covers, counted the same way as the offers.
    const earned: Record<string, number> = {};
    for (const { course } of selectedCourses) {
      const row = byCode.get(course.code);
      if (!row) continue;
      for (const cat of requirementCategories(row, myDepts, collegeSlug)) earned[cat] = (earned[cat] ?? 0) + course.units;
    }
    return recommend(
      platRows, activeRequirements, earned, scheduledCodes, myDepts, collegeSlug,
      Boolean(MAJOR_REQUIREMENTS[selectedMajor]),
    );
  }, [platRows, activeRequirements, selectedCourses, scheduledCodes, byCode, myDepts, collegeSlug, selectedMajor]);
  const recCount = groups.reduce((n, g) => n + g.items.length, 0);

  // ── Search ────────────────────────────────────────────────────────────────
  const query = searchQuery.trim();
  const hits = useMemo(() => (query.length >= 2 ? searchCourses(platRows, query, 60).map((h) => h.row) : []), [platRows, query]);

  // ── Every department ──────────────────────────────────────────────────────
  // Grouped by real department, not by course prefix — Biology is one entry
  // covering BILD/BICD/BIEB/BIMM/BIPN/BISP rather than six separate ones.
  const byDept = useMemo((): Record<string, PlatRow[]> => {
    const result: Record<string, PlatRow[]> = {};
    for (const row of platRows) {
      const dept = departmentForSubject(row.s);
      const college = dept ? null : collegeForSubject(row.s);
      const label = dept?.name ?? college?.name ?? row.s;
      (result[label] ??= []).push(row);
    }
    return result;
  }, [platRows]);

  /**
   * Your own major first — that is what you are here to plan — then the
   * departments with the most courses on offer. Alphabetical order put AAPI
   * and AIP above CSE, which is not how anyone browses a catalog.
   */
  const orderedDepts = useMemo(
    () =>
      Object.entries(byDept)
        .sort(([, a], [, b]) => {
          const mine = (rows: PlatRow[]) => (rows.some((r) => myDepts.has(r.s)) ? 1 : 0);
          if (mine(a) !== mine(b)) return mine(b) - mine(a);
          const offered = (x: PlatRow[]) => x.filter((r) => r.o).length;
          return offered(b) - offered(a) || b.length - a.length;
        })
        .map(([dept]) => dept),
    [byDept, myDepts],
  );

  // Lower division first, then upper, then graduate — and inside each, by how
  // commonly the course is taken, so niche upper-division seminars sink.
  const divisionsOf = (rows: PlatRow[]) => {
    const divisions: [string, PlatRow[]][] = [["Lower division", []], ["Upper division", []], ["Graduate", []]];
    for (const row of rows) {
      const num = parseInt(row.c.replace(/[^0-9]/g, ""), 10);
      divisions[num > 0 && num < 100 ? 0 : num >= 100 && num < 200 ? 1 : 2][1].push(row);
    }
    for (const [, list] of divisions) list.sort(byPopularity);
    return divisions.filter(([, list]) => list.length);
  };

  /**
   * One course, one line: its typical grade, code, title and a button that
   * says whether it is on this term. The colour bar says what it counts toward.
   */
  const renderRow = (row: PlatRow, note?: string) => {
    const course = platRowToCourse(row, myDepts);
    const color = getColorForCourse(course);
    const scheduled = selectedCourses.find((s) => s.course.code === row.k);
    return (
      <li key={row.k} className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-gray-50 dark:hover:bg-white/5">
        <span aria-hidden className="h-6 w-1 shrink-0 rounded-full" style={{ background: color.hex }} />
        <GradeBadge gpa={row.g} terms={row.r} size="xs" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-xs font-bold">{row.k}</span>
            <span className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400">{course.units}u</span>
            {!row.o && <span className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400">· not this term</span>}
          </div>
          <p className="truncate text-[11px] leading-snug text-gray-600 dark:text-gray-400" title={row.t}>
            {row.t}
          </p>
          {note && <p className="truncate text-[11px] leading-snug text-gray-500 dark:text-gray-400">{note}</p>}
        </div>
        <button
          type="button"
          onClick={() => (scheduled ? removeFromSchedule(scheduled.id) : addToSchedule(course))}
          aria-label={scheduled ? `Remove ${row.k} from this term` : `Add ${row.k} to this term`}
          title={scheduled ? "On this term — click to remove" : "Add to this term"}
          className={`shrink-0 rounded-md p-1.5 transition ${
            scheduled
              ? "text-emerald-600 hover:bg-red-50 hover:text-red-600 dark:text-emerald-400 dark:hover:bg-red-500/10"
              : "text-gray-500 hover:bg-[#182B49]/10 hover:text-[#182B49] dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
          }`}
        >
          {scheduled ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </button>
      </li>
    );
  };

  const sectionHead = "px-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* ── Search ── */}
      <div className="shrink-0 px-2 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            aria-label="Search all courses"
            placeholder="Search courses, titles or instructors"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setSearchQuery(""); }}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-8 text-[13px] outline-none transition placeholder:text-gray-500 focus:border-[#182B49] focus:bg-white focus:ring-1 focus:ring-[#182B49] dark:border-white/10 dark:bg-white/5 dark:placeholder:text-gray-400 dark:focus:border-[#FFCD00] dark:focus:ring-[#FFCD00] [&::-webkit-search-cancel-button]:hidden"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {query.length >= 2 ? (
          // ── Matches ──
          <section aria-label="Search results">
            <p className={`${sectionHead} mb-1`} role="status">
              {hits.length ? `${hits.length === 60 ? "Top 60" : hits.length} ${hits.length === 1 ? "match" : "matches"}` : "No matches"}
            </p>
            {hits.length ? (
              <ul className="m-0 list-none space-y-0.5 p-0">{hits.map((row) => renderRow(row))}</ul>
            ) : (
              <p className="px-1.5 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
                Nothing matches “{query}”. Try a course code like “CSE 12” or part of a title.
              </p>
            )}
          </section>
        ) : (
          <>
            {savedPanel}

            {/* ── Recommended for you ── */}
            {recCount > 0 ? (
              <section aria-label="Recommended for you" className="mb-3">
                <button
                  type="button"
                  onClick={() => setRecsFlag(recsOpen ? "0" : "1")}
                  aria-expanded={recsOpen}
                  className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform ${recsOpen ? "rotate-90" : ""}`} />
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#182B49] dark:text-[#FFCD00]" />
                  <span className="whitespace-nowrap text-xs font-bold">Recommended for you</span>
                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                    {recCount} this term
                  </span>
                </button>
                {recsOpen && (
                  <div className="mt-1 space-y-2">
                    {groups.map((g) => {
                      const key = g.category ?? "popular";
                      const all = moreIn.has(key);
                      const items = all ? g.items : g.items.slice(0, PER_GROUP);
                      return (
                        <div key={key}>
                          <p className="flex items-baseline justify-between gap-2 px-1.5">
                            <span className="truncate text-[11px] font-semibold text-gray-700 dark:text-gray-200">
                              {g.category ?? `Popular in your major this term`}
                            </span>
                            {g.category && (
                              <span className="shrink-0 text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                                {g.remaining} units to go
                              </span>
                            )}
                          </p>
                          <ul className="m-0 list-none p-0">
                            {items.map(({ row, also }) => renderRow(row, also.length ? `Also counts toward ${also.join(", ")}` : undefined))}
                          </ul>
                          {g.items.length > PER_GROUP && (
                            <button
                              type="button"
                              onClick={() =>
                                setMoreIn((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                })
                              }
                              className="ml-1.5 mt-0.5 text-[11px] font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]"
                            >
                              {all ? "Show fewer" : `Show ${g.items.length - PER_GROUP} more`}
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {!selectedCollege && (
                      <p className="px-1.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                        Choose your college (top right) to see courses for its GEs too.
                      </p>
                    )}
                  </div>
                )}
              </section>
            ) : (
              <p className="mb-3 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] leading-snug text-gray-600 dark:bg-white/5 dark:text-gray-300">
                <Sparkles className="mr-1 inline h-3.5 w-3.5 text-[#182B49] dark:text-[#FFCD00]" />
                {Object.keys(activeRequirements).length || myDepts.size
                  ? "Nothing left to recommend — your schedule already covers what this term offers toward your program."
                  : "Choose your major and college (top right) to see courses that count toward them."}
              </p>
            )}

            {/* ── Every department ── */}
            <section aria-label="All departments">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className={sectionHead}>All departments</p>
              </div>
              {legend}
              <div className="space-y-0.5">
                {orderedDepts.map((dept) => {
                  const rows = byDept[dept];
                  const isExpanded = expandedDepts.includes(dept);
                  return (
                    <Collapsible key={dept} open={isExpanded} onOpenChange={() => toggleDept(dept)}>
                      <CollapsibleTrigger
                        className={`flex w-full items-center justify-between rounded-md px-1.5 py-1.5 text-xs font-semibold transition-colors ${
                          darkMode ? "text-gray-200 hover:bg-white/5" : "text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                          <span className="truncate">{dept}</span>
                        </span>
                        <span className="ml-1 shrink-0 text-[11px] font-normal tabular-nums text-gray-500 dark:text-gray-400">
                          {rows.length}
                        </span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="ml-2 pb-1">
                          {divisionsOf(rows).map(([name, list]) => (
                            <div key={name} className="mt-1">
                              <p className="px-1.5 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                {name}
                              </p>
                              <ul className="m-0 list-none space-y-0.5 p-0">{list.map((row) => renderRow(row))}</ul>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            </section>

            {AI_ADVISOR_ENABLED && (
              <div className="mt-3 border-t border-gray-200 pt-2 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setAdvisorOpen((v) => !v)}
                  className="text-xs font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]"
                >
                  {advisorOpen ? "Hide the AI advisor" : "Ask the AI advisor about your degree audit"}
                </button>
                {advisorOpen && (
                  <AIAuditUploader
                    darkMode={darkMode}
                    selectedMajor={selectedMajor}
                    selectedMinor={selectedMinor}
                    selectedCollege={selectedCollege}
                    selectedCourses={selectedCourses}
                    addToSchedule={addToSchedule}
                    removeFromSchedule={removeFromSchedule}
                    plannedCourses={plannedCourses}
                    addAICourseToPlan={addAICourseToPlan}
                    removePlannedCourse={removePlannedCourse}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

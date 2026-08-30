"use client";

import { useState, useMemo, Fragment } from "react";
import { Search, ChevronRight, CheckCircle2, Plus, Sparkles, BookOpen, Bot } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Course } from "./types";
import AIAuditUploader from "./AIAuditUploader";
import { GradeBadge } from "@/components/plat/Grade";
import { byPopularity, majorSubjects, platRowToCourse } from "@/lib/plannerBridge";
import { collegeForSubject, departmentForSubject } from "@/data/ucsdStructure";
import type { CourseRow as PlatRow } from "@/lib/plat";

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
  /** Full course list (used to compute recommendations) */
  allCourses: Course[];
  selectedMajor: string;
  selectedMinor: string;
  selectedCollege: string | null;
  plannedCourses: Array<{ courseId: string; course: Course }>;
  addAICourseToPlan: (course: Course, year: 1 | 2 | 3 | 4, quarter: "Fall" | "Winter" | "Spring") => void;
  removePlannedCourse: (courseId: string) => void;
  /** The shared TritonPlat dataset — same courses the explorer shows. */
  platRows: PlatRow[];
  /** Rendered above the catalog so saved courses are the first thing you see. */
  savedPanel?: React.ReactNode;
  legend?: React.ReactNode;
  /**
   * Drop the standalone rail shell (fixed width, border, background) and fill
   * the parent instead — the planner rail owns those now, so that it can host
   * both this and the schedule list at one consistent width.
   */
  embedded?: boolean;
}

export default function CourseCatalog({
  darkMode,
  searchQuery,
  setSearchQuery,
  selectedCourses,
  addToSchedule,
  removeFromSchedule,
  getColorForCourse,
  activeRequirements,
  allCourses,
  selectedMajor,
  selectedMinor,
  selectedCollege,
  plannedCourses,
  addAICourseToPlan,
  removePlannedCourse,
  platRows,
  savedPanel,
  legend,
  embedded = false,
}: CourseCatalogProps) {
  const [activeTab, setActiveTab] = useState<"catalog" | "recommended" | "advisor">("catalog");
  const [expandedDepts, setExpandedDepts] = useState<string[]>(["Computer Science and Engineering"]);

  // Split "MATH 20A" → dept="MATH", courseNumStr="20A"
  // Strip non-digits: "20A" → "20", then parseInt → 20
  const getCourseNumber = (id: string): number => {
    const parts = id.split(" ");
    if (parts.length < 2) return 0;
    const courseNumStr = parts[1];
    const n = parseInt(courseNumStr.replace(/[^0-9]/g, ""), 10);
    return isNaN(n) ? 0 : n;
  };

  const toggleDept = (code: string) =>
    setExpandedDepts((prev) =>
      prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]
    );

  // ── Recommendation logic ──────────────────────────────────────────────────────
  const recommendedCourses = useMemo(() => {
    // Tally units already earned per category (from courses on the calendar)
    const earnedUnits: Record<string, number> = {};
    selectedCourses.forEach(({ course }) => {
      course.categories?.forEach((cat) => {
        earnedUnits[cat] = (earnedUnits[cat] ?? 0) + course.units;
      });
    });

    // Categories that still need units
    const neededCategories = new Set<string>(
      Object.entries(activeRequirements)
        .filter(([cat, target]) => (earnedUnits[cat] ?? 0) < target)
        .map(([cat]) => cat)
    );

    // IDs of courses already on the calendar
    const selectedIds = new Set(selectedCourses.map((sc) => sc.course.id));

    const remainingFor = (cat: string) =>
      (activeRequirements[cat] ?? 0) - (earnedUnits[cat] ?? 0);

    // Filter master list: not already added, has at least one needed category
    const rows = allCourses
      .filter((course) => {
        if (selectedIds.has(course.id)) return false;
        return course.categories?.some((cat) => neededCategories.has(cat)) ?? false;
      })
      .map((course) => {
        const fulfilledCategories = (course.categories ?? []).filter((cat) =>
          neededCategories.has(cat)
        );
        // A course counting toward two areas is filed under the one with the
        // most units outstanding, so it is listed once and where it helps most.
        const primaryCategory =
          [...fulfilledCategories].sort((a, b) => remainingFor(b) - remainingFor(a))[0] ?? "";
        return { course, fulfilledCategories, primaryCategory };
      })
      .sort(
        (a, b) =>
          remainingFor(b.primaryCategory) - remainingFor(a.primaryCategory) ||
          a.primaryCategory.localeCompare(b.primaryCategory) ||
          a.course.code.localeCompare(b.course.code)
      );

    const perGroup: Record<string, number> = {};
    for (const r of rows) perGroup[r.primaryCategory] = (perGroup[r.primaryCategory] ?? 0) + 1;

    return rows.map((row, i) => ({
      ...row,
      isFirstOfGroup: i === 0 || rows[i - 1].primaryCategory !== row.primaryCategory,
      groupRemaining: remainingFor(row.primaryCategory),
      groupCount: perGroup[row.primaryCategory] ?? 0,
    }));
  }, [allCourses, activeRequirements, selectedCourses]);

  // ── Catalog tab: the shared dataset, filtered and grouped by department ─────
  // Grouped by real department, not by course prefix — Biology is one entry
  // covering BILD/BICD/BIEB/BIMM/BIPN/BISP rather than six separate ones.
  const filteredCategorized = useMemo((): Record<string, PlatRow[]> => {
    const q = searchQuery.trim().toLowerCase();
    const result: Record<string, PlatRow[]> = {};
    for (const row of platRows) {
      if (q && !`${row.k} ${row.t}`.toLowerCase().includes(q)) continue;
      const dept = departmentForSubject(row.s);
      const college = dept ? null : collegeForSubject(row.s);
      const label = dept?.name ?? college?.name ?? row.s;
      (result[label] ??= []).push(row);
    }
    return result;
  }, [platRows, searchQuery]);

  const totalFilteredCount = useMemo(
    () => Object.values(filteredCategorized).reduce((n, arr) => n + arr.length, 0),
    [filteredCategorized]
  );

  /**
   * Departments with the most courses on offer surface first, and within each
   * department the courses students actually take lead. Alphabetical order put
   * AAPI and AIP above CSE, which is not how anyone browses a catalog.
   */
  const myDepts = useMemo(() => majorSubjects(selectedMajor), [selectedMajor]);

  const orderedDepts = useMemo(
    () =>
      Object.entries(filteredCategorized)
        .sort(([, a], [, b]) => {
          // Your own major first — that is what you are here to plan.
          const mine = (rows: PlatRow[]) => (rows.some((r) => myDepts.has(r.s)) ? 1 : 0);
          if (mine(a) !== mine(b)) return mine(b) - mine(a);
          const offered = (x: PlatRow[]) => x.filter((r) => r.o).length;
          return offered(b) - offered(a) || b.length - a.length;
        })
        .map(([dept]) => dept),
    [filteredCategorized, myDepts]
  );

  // Lower division first, then upper, then graduate — and inside each, by how
  // commonly the course is taken, so niche upper-division seminars sink.
  const groupedCatalog = useMemo((): Record<string, Record<string, PlatRow[]>> => {
    const result: Record<string, Record<string, PlatRow[]>> = {};
    for (const [dept, courses] of Object.entries(filteredCategorized)) {
      const divisions: Record<string, PlatRow[]> = {
        "Lower Division": [],
        "Upper Division": [],
        "Graduate": [],
      };
      for (const row of courses) {
        const num = parseInt(row.c.replace(/[^0-9]/g, ""), 10);
        if (num > 0 && num < 100) divisions["Lower Division"].push(row);
        else if (num >= 100 && num < 200) divisions["Upper Division"].push(row);
        else divisions["Graduate"].push(row);
      }
      for (const key of Object.keys(divisions)) divisions[key].sort(byPopularity);
      result[dept] = divisions;
    }
    return result;
  }, [filteredCategorized]);

  // ── Course row renderer (component-scope so CollapsibleContent can call it) ───
  /**
   * A catalog line now carries what it actually is: the typical grade, the real
   * title and unit count, and a colour bar for what it counts toward. It used to
   * show the course code as its own title with units hardcoded to 4.
   */
  const renderCourseRow = (row: PlatRow) => {
    const course = platRowToCourse(row, myDepts);
    const color = getColorForCourse(course);
    const scheduledItem = selectedCourses.find((s) => s.course.code === row.k);
    const isAdded = !!scheduledItem;
    return (
      <div
        key={row.k}
        className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${
          darkMode ? "hover:bg-gray-700" : "hover:bg-gray-50"
        }`}
      >
        <span
          className="h-7 w-1 flex-shrink-0 rounded-full"
          style={{ background: color.hex }}
          title={course.genEd?.length ? "Counts toward a requirement" : undefined}
        />
        <GradeBadge gpa={row.g} terms={row.r} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold truncate">{row.k}</span>
            <span className={`text-[10px] flex-shrink-0 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
              {course.units}u
            </span>
            {!row.o && (
              <span className="text-[9px] text-gray-400 flex-shrink-0">not this term</span>
            )}
          </div>
          <div className={`text-[10px] truncate ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
            {row.t}
          </div>
        </div>
        <button
          onClick={() => {
            if (isAdded) removeFromSchedule(scheduledItem!.id);
            else addToSchedule(course);
          }}
          className={`ml-1 flex-shrink-0 p-1 rounded transition-colors ${
            isAdded
              ? "text-green-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
              : "text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
          }`}
        >
          {isAdded ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>
    );
  };

  // ── Shared tab button styles ──────────────────────────────────────────────────
  const tabCls = (tab: "catalog" | "recommended" | "advisor") =>
    `flex-1 flex items-center justify-center gap-1 px-1.5 py-2 text-[11px] font-semibold transition-colors border-b-2 ${
      activeTab === tab
        ? darkMode
          ? "border-blue-400 text-blue-400"
          : "border-blue-600 text-blue-600"
        : darkMode
        ? "border-transparent text-gray-400 hover:text-gray-200"
        : "border-transparent text-gray-500 hover:text-gray-700"
    }`;

  return (
    <aside
      className={
        embedded
          ? "flex min-h-0 flex-1 flex-col overflow-hidden"
          : `w-72 flex-shrink-0 flex flex-col border-r overflow-hidden ${
              darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
            }`
      }
    >
      {/* ── Tab bar ──────────────────────────────────────────────────────────── */}
      <div
        className={`flex border-b flex-shrink-0 ${
          darkMode ? "border-gray-700" : "border-gray-200"
        }`}
      >
        <button className={tabCls("catalog")} onClick={() => setActiveTab("catalog")}>
          <BookOpen className="w-3.5 h-3.5" />
          Course Catalog
        </button>
        <button
          className={tabCls("recommended")}
          onClick={() => setActiveTab("recommended")}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Recommended
          {recommendedCourses.length > 0 && (
            <span
              className={`ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                darkMode
                  ? "bg-blue-900/60 text-blue-300"
                  : "bg-blue-100 text-blue-700"
              }`}
            >
              {recommendedCourses.length}
            </span>
          )}
        </button>
        <button
          className={tabCls("advisor")}
          onClick={() => setActiveTab("advisor")}
        >
          <Bot className="w-3.5 h-3.5" />
          AI Advisor
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          CATALOG TAB
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "catalog" && (
        <>
          {/* Search bar */}
          <div
            className={`px-3 py-3 border-b flex-shrink-0 ${
              darkMode ? "border-gray-700" : "border-gray-200"
            }`}
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search courses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-9 pr-3 py-2 text-sm rounded-lg border ${
                  darkMode
                    ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500"
                    : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-500"
                } outline-none focus:ring-1 focus:ring-blue-500`}
              />
            </div>
          </div>

          {/* Scrollable course list */}
          <div className="flex-1 overflow-y-auto">
            {savedPanel && <div className="px-2 pt-2">{savedPanel}</div>}
            {legend}
            <div className="p-2">
              {Object.keys(filteredCategorized).length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  No courses found
                </div>
              ) : (
                <div className="space-y-0.5">
                  {orderedDepts.map((dept) => {
                    const courses = filteredCategorized[dept];
                    const isExpanded = expandedDepts.includes(dept);
                    return (
                      <Collapsible
                        key={dept}
                        open={isExpanded}
                        onOpenChange={() => toggleDept(dept)}
                      >
                        <CollapsibleTrigger
                          className={`flex items-center justify-between w-full px-2 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                            darkMode
                              ? "text-gray-300 hover:bg-gray-700"
                              : "text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <ChevronRight
                              className={`w-3 h-3 flex-shrink-0 transition-transform ${
                                isExpanded ? "rotate-90" : ""
                              }`}
                            />
                            <span className="truncate">{dept}</span>
                          </div>
                          <span
                            className={`ml-1 flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${
                              darkMode
                                ? "bg-gray-600 text-gray-400"
                                : "bg-gray-100 text-gray-400"
                            }`}
                          >
                            {courses.length}
                          </span>
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                          <div className="ml-2 mt-0.5 pb-1">
                            {Object.entries(groupedCatalog[dept] ?? {})
                              .filter(([, divCourses]) => divCourses.length > 0)
                              .map(([divisionName, divCourses], divIdx) => (
                                <div key={divisionName} className={divIdx > 0 ? "mt-1" : ""}>
                                  <div
                                    className={`px-2 pt-1 pb-0.5 text-[9px] font-bold uppercase tracking-wider ${
                                      darkMode ? "text-gray-600" : "text-gray-400"
                                    }`}
                                  >
                                    {divisionName}
                                  </div>
                                  <div className="space-y-0.5">
                                    {divCourses.map((row) => renderCourseRow(row))}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer: quick stats */}
          <div
            className={`px-3 py-2 border-t text-xs flex-shrink-0 ${
              darkMode
                ? "border-gray-700 text-gray-500"
                : "border-gray-200 text-gray-400"
            }`}
          >
            {totalFilteredCount} course{totalFilteredCount !== 1 ? "s" : ""}{" "}
            available
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          RECOMMENDED TAB
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "recommended" && (
        <>
          <div className="flex-1 overflow-y-auto">
            <div className="p-2.5 space-y-1.5">
              {Object.keys(activeRequirements).length === 0 ? (
                <div className="text-center py-10 px-3">
                  <Sparkles
                    className={`w-8 h-8 mx-auto mb-2 ${
                      darkMode ? "text-gray-600" : "text-gray-300"
                    }`}
                  />
                  <p
                    className={`text-sm font-medium mb-1 ${
                      darkMode ? "text-gray-300" : "text-gray-600"
                    }`}
                  >
                    No profile selected
                  </p>
                  <p
                    className={`text-xs ${
                      darkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    Choose a Major or College above to see personalized course
                    recommendations.
                  </p>
                </div>
              ) : recommendedCourses.length === 0 ? (
                <div className="text-center py-10 px-3">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
                  <p
                    className={`text-sm font-medium mb-1 ${
                      darkMode ? "text-gray-300" : "text-gray-600"
                    }`}
                  >
                    All requirements covered!
                  </p>
                  <p
                    className={`text-xs ${
                      darkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    Every requirement category is fulfilled by your current
                    schedule.
                  </p>
                </div>
              ) : (
                recommendedCourses.map(({
                  course,
                  fulfilledCategories,
                  primaryCategory,
                  isFirstOfGroup,
                  groupRemaining,
                  groupCount,
                }) => {
                  const scheduledItem = selectedCourses.find(
                    (s) => s.course.id === course.id
                  );
                  const isAdded = !!scheduledItem;
                  const color = getColorForCourse(course);
                  return (
                    <Fragment key={course.id}>
                      {isFirstOfGroup && (
                        <div className="flex items-baseline justify-between gap-2 px-0.5 pt-2 pb-1">
                          <span
                            className={`text-[11px] font-bold uppercase tracking-wide ${
                              darkMode ? "text-gray-300" : "text-gray-600"
                            }`}
                          >
                            {primaryCategory}
                          </span>
                          <span
                            className={`text-[10px] tabular-nums ${
                              darkMode ? "text-gray-500" : "text-gray-400"
                            }`}
                          >
                            {groupRemaining > 0
                              ? `${groupRemaining} units to go · ${groupCount} option${groupCount === 1 ? "" : "s"}`
                              : `${groupCount} option${groupCount === 1 ? "" : "s"}`}
                          </span>
                        </div>
                      )}
                    <div
                      className={`rounded-lg border px-2.5 py-2 transition-colors ${
                        darkMode
                          ? "border-gray-700 bg-gray-800/60 hover:bg-gray-700/60"
                          : "border-gray-100 bg-white hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        {/* Course info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color.bg} ${color.text}`}
                            >
                              {course.code}
                            </span>
                            <span
                              className={`text-[10px] ${
                                darkMode ? "text-gray-500" : "text-gray-400"
                              }`}
                            >
                              {course.units}u
                            </span>
                          </div>
                          <p
                            className={`text-xs mt-0.5 leading-snug ${
                              darkMode ? "text-gray-200" : "text-gray-700"
                            }`}
                          >
                            {course.title}
                          </p>

                          {/* Fulfillment badges */}
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {fulfilledCategories.map((cat) => (
                              <span
                                key={cat}
                                className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full leading-tight"
                              >
                                Fulfills: {cat}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Add / remove button */}
                        <button
                          onClick={() =>
                            isAdded
                              ? removeFromSchedule(scheduledItem!.id)
                              : addToSchedule(course)
                          }
                          className={`flex-shrink-0 p-1 rounded transition-colors ${
                            isAdded
                              ? "text-green-600 hover:text-red-500 hover:bg-red-50"
                              : "text-gray-400 hover:text-green-600 hover:bg-green-50"
                          }`}
                        >
                          {isAdded ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <Plus className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    </Fragment>
                  );
                })
              )}
            </div>
          </div>

          {/* Footer */}
          <div
            className={`px-3 py-2 border-t text-xs flex-shrink-0 ${
              darkMode
                ? "border-gray-700 text-gray-500"
                : "border-gray-200 text-gray-400"
            }`}
          >
            {recommendedCourses.length} course
            {recommendedCourses.length !== 1 ? "s" : ""} recommended
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          AI ADVISOR TAB
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "advisor" && (
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
    </aside>
  );
}

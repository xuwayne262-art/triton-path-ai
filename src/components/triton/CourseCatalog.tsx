"use client";

import { useState, useMemo } from "react";
import { Search, ChevronRight, CheckCircle2, Plus, Sparkles, BookOpen, Bot } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Course } from "./types";
import type { COURSE_COLORS } from "./types";
import AIAuditUploader from "./AIAuditUploader";
import { CATEGORIZED_COURSES } from "@/data/categorizedCourses";
import type { HistoricalCourse } from "@/data/categorizedCourses";

interface ScheduleCourse {
  course: Course;
  id: string;
}

type CourseColor = (typeof COURSE_COLORS)[number];

interface CourseCatalogProps {
  darkMode: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedCourses: ScheduleCourse[];
  addToSchedule: (course: Course) => void;
  removeFromSchedule: (id: string) => void;
  getColorForCourse: (idx: number) => CourseColor;
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
}: CourseCatalogProps) {
  const [activeTab, setActiveTab] = useState<"catalog" | "recommended" | "advisor">("catalog");
  const [expandedDepts, setExpandedDepts] = useState<string[]>(["CSE", "MATH", "DSC"]);

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

    // Filter master list: not already added, has at least one needed category
    return allCourses
      .filter((course) => {
        if (selectedIds.has(course.id)) return false;
        return course.categories?.some((cat) => neededCategories.has(cat)) ?? false;
      })
      .map((course) => ({
        course,
        fulfilledCategories: (course.categories ?? []).filter((cat) =>
          neededCategories.has(cat)
        ),
      }));
  }, [allCourses, activeRequirements, selectedCourses]);

  // ── Catalog tab: filter CATEGORIZED_COURSES by search query ──────────────────
  const filteredCategorized = useMemo((): Record<string, HistoricalCourse[]> => {
    if (!searchQuery.trim()) return CATEGORIZED_COURSES;
    const q = searchQuery.toLowerCase();
    const result: Record<string, HistoricalCourse[]> = {};
    for (const [dept, courses] of Object.entries(CATEGORIZED_COURSES)) {
      const filtered = courses.filter((c) => c.id.toLowerCase().includes(q));
      if (filtered.length > 0) result[dept] = filtered;
    }
    return result;
  }, [searchQuery]);

  const totalFilteredCount = useMemo(
    () => Object.values(filteredCategorized).reduce((n, arr) => n + arr.length, 0),
    [filteredCategorized]
  );

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
      className={`w-72 flex-shrink-0 flex flex-col border-r overflow-hidden ${
        darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
      }`}
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
            <div className="p-2">
              {Object.keys(filteredCategorized).length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  No courses found
                </div>
              ) : (
                <div className="space-y-0.5">
                  {Object.entries(filteredCategorized).map(([dept, courses]) => {
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
                          <div className="ml-2 mt-0.5 space-y-0.5 pb-1">
                            {courses.map((hc, idx) => {
                              const color = getColorForCourse(idx);
                              const scheduledItem = selectedCourses.find(
                                (s) => s.course.code === hc.id
                              );
                              const isAdded = !!scheduledItem;
                              return (
                                <div
                                  key={hc.id}
                                  className={`flex items-center justify-between px-2 py-1.5 rounded-md transition-colors ${
                                    darkMode
                                      ? "hover:bg-gray-700"
                                      : "hover:bg-gray-50"
                                  }`}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span
                                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color.bg} ${color.text}`}
                                      >
                                        {hc.id}
                                      </span>
                                      <span
                                        className={`text-[10px] ${
                                          darkMode
                                            ? "text-gray-500"
                                            : "text-gray-400"
                                        }`}
                                      >
                                        {hc.termsOffered.join(" · ")}
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => {
                                      if (isAdded) {
                                        removeFromSchedule(scheduledItem!.id);
                                      } else {
                                        addToSchedule({
                                          id: hc.id.toLowerCase().replace(/\s+/g, ""),
                                          code: hc.id,
                                          title: hc.id,
                                          units: 4,
                                          departments: [dept],
                                        });
                                      }
                                    }}
                                    className={`ml-1.5 flex-shrink-0 p-1 rounded transition-colors ${
                                      isAdded
                                        ? "text-green-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                        : "text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                                    }`}
                                  >
                                    {isAdded ? (
                                      <CheckCircle2 className="w-4 h-4" />
                                    ) : (
                                      <Plus className="w-4 h-4" />
                                    )}
                                  </button>
                                </div>
                              );
                            })}
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
                recommendedCourses.map(({ course, fulfilledCategories }, idx) => {
                  const scheduledItem = selectedCourses.find(
                    (s) => s.course.id === course.id
                  );
                  const isAdded = !!scheduledItem;
                  const color = getColorForCourse(idx);
                  return (
                    <div
                      key={course.id}
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

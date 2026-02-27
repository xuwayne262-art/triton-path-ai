"use client";

import { useState, useMemo } from "react";
import { Search, ChevronRight, CheckCircle2, Plus, Sparkles, BookOpen } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Course } from "./types";
import type { COURSE_COLORS } from "./types";

interface Department {
  code: string;
  name: string;
  courseCount: number;
}

interface ScheduleCourse {
  course: Course;
  id: string;
}

type CourseColor = (typeof COURSE_COLORS)[number];

interface CourseCatalogProps {
  darkMode: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filteredCourses: Course[];
  groupedCourses: Record<string, Course[]>;
  allDepartments: Department[];
  expandedDepts: string[];
  toggleDept: (code: string) => void;
  selectedCourses: ScheduleCourse[];
  addToSchedule: (course: Course) => void;
  removeFromSchedule: (id: string) => void;
  getColorForCourse: (idx: number) => CourseColor;
  /** Merged { category → targetUnits } from major + minor + college */
  activeRequirements: Record<string, number>;
  /** Full course list (used to compute recommendations) */
  allCourses: Course[];
}

export default function CourseCatalog({
  darkMode,
  searchQuery,
  setSearchQuery,
  filteredCourses,
  groupedCourses,
  allDepartments,
  expandedDepts,
  toggleDept,
  selectedCourses,
  addToSchedule,
  removeFromSchedule,
  getColorForCourse,
  activeRequirements,
  allCourses,
}: CourseCatalogProps) {
  const [activeTab, setActiveTab] = useState<"catalog" | "recommended">("catalog");

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

  // ── Shared tab button styles ──────────────────────────────────────────────────
  const tabCls = (tab: "catalog" | "recommended") =>
    `flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors border-b-2 ${
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
              {filteredCourses.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  No courses found
                </div>
              ) : (
                <div className="space-y-0.5">
                  {Object.entries(groupedCourses).map(([dept, courses]) => {
                    const deptName =
                      allDepartments.find((d) => d.code === dept)?.name ?? dept;
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
                            <span className="truncate">{deptName}</span>
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
                            {courses.map((course) => {
                              const globalIdx = filteredCourses.indexOf(course);
                              const color = getColorForCourse(globalIdx);
                              const scheduledItem = selectedCourses.find(
                                (s) => s.course.id === course.id
                              );
                              const isAdded = !!scheduledItem;
                              return (
                                <div
                                  key={course.id}
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
                                        {course.code}
                                      </span>
                                      <span
                                        className={`text-[10px] ${
                                          darkMode
                                            ? "text-gray-500"
                                            : "text-gray-400"
                                        }`}
                                      >
                                        {course.units}u
                                      </span>
                                    </div>
                                    <p
                                      className={`text-xs truncate mt-0.5 ${
                                        darkMode
                                          ? "text-gray-200"
                                          : "text-gray-700"
                                      }`}
                                    >
                                      {course.title}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() =>
                                      isAdded
                                        ? removeFromSchedule(scheduledItem!.id)
                                        : addToSchedule(course)
                                    }
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
            {filteredCourses.length} course{filteredCourses.length !== 1 ? "s" : ""}{" "}
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
    </aside>
  );
}

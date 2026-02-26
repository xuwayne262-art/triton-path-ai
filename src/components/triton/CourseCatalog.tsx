"use client";

import { Search, ChevronRight, CheckCircle2, Plus } from "lucide-react";
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
}: CourseCatalogProps) {
  return (
    <aside
      className={`w-72 flex-shrink-0 flex flex-col border-r overflow-hidden ${
        darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
      }`}
    >
      {/* Search bar */}
      <div
        className={`px-3 py-3 border-b ${
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
                                    darkMode ? "text-gray-200" : "text-gray-700"
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
        className={`px-3 py-2 border-t text-xs ${
          darkMode
            ? "border-gray-700 text-gray-500"
            : "border-gray-200 text-gray-400"
        }`}
      >
        {filteredCourses.length} course{filteredCourses.length !== 1 ? "s" : ""}{" "}
        available
      </div>
    </aside>
  );
}

"use client";

import { AlertTriangle, CalendarDays, RotateCcw, X } from "lucide-react";
import type { Course } from "./types";

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

/** "Mon 09:00–10:00 · Wed 09:00–10:00", or nothing when the course has no times. */
function meetingLine(course: Course): string | null {
  if (!course.time?.length) return null;
  return course.time.map((t) => `${t.day} ${t.start}–${t.end}`).join(" · ");
}

/**
 * The right rail of the term workspace: what you are actually taking this
 * quarter. The calendar shows when those courses meet, but a week grid is a bad
 * place to read a unit total or spot the one class that collides with another,
 * so the list carries both.
 */
export default function TermCourses({
  darkMode,
  selectedCourses,
  conflicts,
  getColorForCourse,
  removeFromSchedule,
  clearSchedule,
}: {
  darkMode: boolean;
  selectedCourses: ScheduleCourse[];
  conflicts: string[];
  getColorForCourse: (course: Course) => CourseColor;
  removeFromSchedule: (id: string) => void;
  clearSchedule: () => void;
}) {
  const totalUnits = selectedCourses.reduce((sum, c) => sum + c.course.units, 0);
  const clashing = new Set(
    conflicts.flatMap((pair) =>
      selectedCourses.filter((sc) => pair.includes(sc.id)).map((sc) => sc.id),
    ),
  );

  return (
    <aside
      className={`w-64 flex-shrink-0 flex flex-col border-l overflow-hidden ${
        darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
      }`}
    >
      {/* Header */}
      <div
        className={`px-4 py-3 border-b flex-shrink-0 ${
          darkMode ? "border-gray-700" : "border-gray-200"
        }`}
      >
        <div className="flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-blue-500" />
          <span className={`text-xs font-semibold ${darkMode ? "text-gray-200" : "text-gray-700"}`}>
            This term
          </span>
          <span className="ml-auto text-[10px] text-gray-400">
            {selectedCourses.length} · {totalUnits}u
          </span>
        </div>
        {clashing.size > 0 && (
          <p className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-red-500">
            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
            {clashing.size} course{clashing.size === 1 ? "" : "s"} overlap
          </p>
        )}
      </div>

      {/* Course list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {selectedCourses.length === 0 ? (
          <p
            className={`px-2 py-4 text-[11px] leading-relaxed ${
              darkMode ? "text-gray-500" : "text-gray-400"
            }`}
          >
            Nothing on the calendar yet. Add a course from the catalog on the left and it
            shows up here with its meeting times.
          </p>
        ) : (
          <ul className="m-0 list-none space-y-1 p-0">
            {selectedCourses.map((sc) => {
              const color = getColorForCourse(sc.course);
              const meets = meetingLine(sc.course);
              const clashes = clashing.has(sc.id);
              return (
                <li
                  key={sc.id}
                  className={`group relative rounded-lg border-l-4 px-2 py-1.5 ${color.bg} ${color.border} ${
                    clashes ? "ring-1 ring-red-500" : ""
                  }`}
                >
                  <div className="flex items-start gap-1">
                    <p className={`text-[11px] font-bold leading-tight ${color.text}`}>
                      {sc.course.code}
                    </p>
                    <span className={`ml-auto pr-4 text-[10px] tabular-nums ${color.text} opacity-70`}>
                      {sc.course.units}u
                    </span>
                  </div>
                  <p className={`truncate text-[10px] ${color.text} opacity-80`}>
                    {sc.course.title}
                  </p>
                  {meets && (
                    <p className={`mt-0.5 text-[10px] ${color.text} opacity-60`}>{meets}</p>
                  )}
                  <button
                    onClick={() => removeFromSchedule(sc.id)}
                    aria-label={`Remove ${sc.course.code} from this term`}
                    className="absolute top-1 right-1 rounded p-0.5 text-gray-600 opacity-0 transition-opacity bg-white/70 hover:bg-white hover:text-red-600 group-hover:opacity-100"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div
        className={`px-4 py-3 border-t flex-shrink-0 text-xs ${
          darkMode ? "border-gray-700 text-gray-400" : "border-gray-200 text-gray-500"
        }`}
      >
        <div className="flex justify-between mb-1">
          <span>Courses</span>
          <span className="font-semibold">{selectedCourses.length}</span>
        </div>
        <div className="flex justify-between">
          <span>Total units</span>
          <span className="font-semibold">{totalUnits}</span>
        </div>
        {selectedCourses.length > 0 && (
          <button
            onClick={clearSchedule}
            className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] ${
              darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
            }`}
          >
            <RotateCcw className="w-3 h-3" />
            Clear term
          </button>
        )}
      </div>
    </aside>
  );
}

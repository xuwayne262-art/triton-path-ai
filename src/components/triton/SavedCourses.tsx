"use client";

import { BookMarked, CheckCircle2, Plus, X } from "lucide-react";
import Link from "next/link";
import { GradeBadge } from "@/components/plat/Grade";
import { ROLE_STYLES, type CourseRole } from "@/lib/plannerBridge";
import type { CourseRow } from "@/lib/plat";
import type { Course } from "./types";

/**
 * Courses starred over in the explorer. They are placed on the weekly schedule
 * automatically; this panel is the record of what you saved, so you can drop one
 * from the schedule and still put it back without hunting for it again.
 */
export default function SavedCourses({
  darkMode,
  saved,
  scheduledCodes,
  roleOf,
  onAdd,
  onRemoveSaved,
}: {
  darkMode: boolean;
  saved: { course: Course; row: CourseRow }[];
  scheduledCodes: Set<string>;
  roleOf: (course: Course) => CourseRole;
  onAdd: (course: Course) => void;
  onRemoveSaved: (code: string) => void;
}) {
  return (
    <div
      className={`rounded-lg border ${
        darkMode ? "border-gray-700 bg-gray-800/50" : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2 dark:border-gray-700">
        <BookMarked className="h-3.5 w-3.5 text-[#182B49] dark:text-[#FFCD00]" />
        <span className="text-xs font-bold">Saved from Courses</span>
        <span className="ml-auto text-[10px] text-gray-400">{saved.length}</span>
      </div>

      {saved.length === 0 ? (
        <p className="px-3 py-4 text-[11px] leading-relaxed text-gray-400">
          Nothing saved yet. Browse{" "}
          <Link href="/" className="underline">
            Courses
          </Link>{" "}
          and hit <span className="font-semibold">Save to planner</span> — anything you save
          drops straight onto your weekly schedule.
        </p>
      ) : (
        <ul className="m-0 max-h-64 list-none overflow-y-auto p-1">
          {saved.map(({ course, row }) => {
            const added = scheduledCodes.has(course.code);
            const style = ROLE_STYLES[roleOf(course)];
            return (
              <li
                key={course.code}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
                  darkMode ? "hover:bg-gray-700" : "hover:bg-gray-50"
                }`}
              >
                <span
                  className={`h-8 w-1 shrink-0 rounded-full ${style.border}`}
                  style={{ background: style.hex }}
                  title={style.label}
                />
                <GradeBadge gpa={row.g} terms={row.r} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-bold">{course.code}</span>
                  <span
                    className={`block truncate text-[10px] ${
                      darkMode ? "text-gray-400" : "text-gray-500"
                    }`}
                  >
                    {course.title}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onAdd(course)}
                  disabled={added}
                  title={added ? "On your schedule" : "Put back on the schedule"}
                  className={`shrink-0 rounded p-1 transition-colors ${
                    added
                      ? "text-green-600"
                      : "text-gray-400 hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-900/20"
                  }`}
                >
                  {added ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveSaved(course.code)}
                  title="Remove from saved"
                  className="shrink-0 rounded p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Explains what the colours mean, so they read as information rather than decoration. */
export function ColorLegend({ darkMode }: { darkMode: boolean }) {
  const roles: CourseRole[] = ["major", "ge", "minor", "elective"];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-2">
      {roles.map((r) => (
        <span key={r} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: ROLE_STYLES[r].hex }}
          />
          <span className={`text-[10px] ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
            {ROLE_STYLES[r].label}
          </span>
        </span>
      ))}
    </div>
  );
}

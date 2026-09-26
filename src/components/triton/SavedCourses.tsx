"use client";

import { BookMarked, CheckCircle2, Plus, X } from "lucide-react";
import { GradeBadge } from "@/components/plat/Grade";
import { ROLE_STYLES, type CourseRole } from "@/lib/plannerBridge";
import type { CourseRow } from "@/lib/plat";
import type { Course } from "./types";

/**
 * Courses saved over in the explorer. They are placed on the weekly schedule
 * automatically; this panel is the record of what you saved, so you can drop one
 * from the schedule and still put it back without hunting for it again.
 *
 * Only shown once something is saved — its empty state used to be the largest
 * thing at the top of Browse, explaining a button on another page.
 */
export default function SavedCourses({
  saved,
  scheduledCodes,
  roleOf,
  onAdd,
  onRemoveSaved,
}: {
  saved: { course: Course; row: CourseRow }[];
  scheduledCodes: Set<string>;
  roleOf: (course: Course) => CourseRole;
  onAdd: (course: Course) => void;
  onRemoveSaved: (code: string) => void;
}) {
  if (!saved.length) return null;
  return (
    <section aria-label="Saved from Courses" className="mb-3 rounded-lg border border-gray-200 dark:border-white/10">
      <div className="flex items-center gap-1.5 border-b border-gray-200 px-2.5 py-1.5 dark:border-white/10">
        <BookMarked className="h-3.5 w-3.5 text-[#182B49] dark:text-[#FFCD00]" />
        <span className="text-xs font-bold">Saved from Courses</span>
        <span className="ml-auto text-[11px] tabular-nums text-gray-500 dark:text-gray-400">{saved.length}</span>
      </div>
      <ul className="m-0 max-h-48 list-none overflow-y-auto p-1">
        {saved.map(({ course, row }) => {
          const added = scheduledCodes.has(course.code);
          const style = ROLE_STYLES[roleOf(course)];
          return (
            <li key={course.code} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-gray-50 dark:hover:bg-white/5">
              <span aria-hidden className="h-6 w-1 shrink-0 rounded-full" style={{ background: style.hex }} title={style.label} />
              <GradeBadge gpa={row.g} terms={row.r} size="xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold">{course.code}</span>
                <span className="block truncate text-[11px] text-gray-600 dark:text-gray-400">{course.title}</span>
              </span>
              <button
                type="button"
                onClick={() => onAdd(course)}
                disabled={added}
                aria-label={added ? `${course.code} is on your schedule` : `Put ${course.code} back on the schedule`}
                title={added ? "On your schedule" : "Put back on the schedule"}
                className={`shrink-0 rounded-md p-1.5 transition-colors ${
                  added
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-gray-500 hover:bg-[#182B49]/10 hover:text-[#182B49] dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
                }`}
              >
                {added ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => onRemoveSaved(course.code)}
                aria-label={`Remove ${course.code} from saved`}
                title="Remove from saved"
                className="shrink-0 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Explains what the colours mean, so they read as information rather than decoration. */
export function ColorLegend() {
  const roles: CourseRole[] = ["major", "ge", "minor", "elective"];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1.5 pb-1.5">
      {roles.map((r) => (
        <span key={r} className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: ROLE_STYLES[r].hex }} />
          <span className="text-[11px] text-gray-600 dark:text-gray-400">{ROLE_STYLES[r].label}</span>
        </span>
      ))}
    </div>
  );
}

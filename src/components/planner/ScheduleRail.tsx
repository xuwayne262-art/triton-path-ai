"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, Check, ChevronDown, Loader2, Star, Trash2, Wand2,
} from "lucide-react";
import { GradeBadge } from "@/components/plat/Grade";
import SectionPicker from "@/components/plat/SectionPicker";
import { courseHref, type CourseRow, type SectionTuple } from "@/lib/plat";
import { ROLE_STYLES, type CourseRole } from "@/lib/plannerBridge";
import {
  CODE, TYPE, groupSections, selectedSections, typeLabel,
  type SectionSelection,
} from "@/lib/sections";
import type { Course } from "@/components/triton/types";
import type { ScheduleCourse, SectionStatus } from "@/app/planner/PlannerProvider";

/**
 * What you are taking this term, and the sections that make it real.
 *
 * This used to be a third column that only listed course codes, which cost the
 * calendar 256px and answered a question the calendar already answered. Folding
 * it into the left rail as a tab bought that width back and gave the section
 * picker somewhere to live: the same card that says you are taking CSE 11 is
 * where you say *which* CSE 11.
 */

/** One line summarising the current pick: "Lecture A00 · Discussion A01". */
function pickSummary(sec: SectionTuple[], sel: SectionSelection | undefined): string {
  const chosen = selectedSections(groupSections(sec), sel);
  if (!chosen.length) return "";
  return chosen.map((s) => `${typeLabel(s[TYPE])} ${s[CODE]}`).join(" · ");
}

function StatusLine({ status, summary }: { status: SectionStatus; summary: string }) {
  if (status.loading) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-gray-400">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading sections…
      </span>
    );
  }
  if (!status.available) {
    return (
      <span className="text-[11px] text-gray-400">
        No sections published — showing the catalog meeting time
      </span>
    );
  }
  if (status.complete) {
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        <Check className="h-3 w-3 shrink-0" /> {summary}
      </span>
    );
  }
  if (status.started) {
    return (
      <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
        Still need a {status.missing.join(" and a ")}
      </span>
    );
  }
  return <span className="text-[11px] text-gray-400">No section chosen yet</span>;
}

function CourseCard({
  entry, row, role, sec, status, selection, conflicted, darkMode,
  onRemove, onSelect, onAutoPick,
}: {
  entry: ScheduleCourse;
  row: CourseRow | undefined;
  role: CourseRole;
  sec: SectionTuple[];
  status: SectionStatus;
  selection: SectionSelection | undefined;
  conflicted: boolean;
  darkMode: boolean;
  onRemove: () => void;
  onSelect: (next: SectionSelection) => void;
  onAutoPick: () => void;
}) {
  const course = entry.course;
  // Anything unresolved is worth opening on sight; a settled course stays shut.
  const [open, setOpen] = useState(status.available && !status.complete);
  const style = ROLE_STYLES[role];
  const summary = pickSummary(sec, selection);

  return (
    <li
      className={`rounded-xl border ${
        conflicted
          ? "border-red-400 dark:border-red-500/60"
          : darkMode ? "border-white/10 bg-gray-800/60" : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-2 p-2.5">
        <span
          aria-hidden
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: style.hex }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <Link
              href={courseHref(course.code)}
              className="truncate text-[13px] font-bold hover:underline"
            >
              {course.code}
            </Link>
            <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
              {course.units}u
            </span>
          </div>
          <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{course.title}</p>

          {row?.p && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-gray-500 dark:text-gray-400">
              <span className="truncate">{row.p}</span>
              {row.pq != null && (
                <span className="flex shrink-0 items-center gap-0.5 text-amber-500">
                  <Star className="h-2.5 w-2.5 fill-current" />
                  {row.pq.toFixed(1)}
                </span>
              )}
            </p>
          )}

          <div className="mt-1">
            <StatusLine status={status} summary={summary} />
          </div>

          {conflicted && (
            <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              Overlaps another course
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1">
          <GradeBadge gpa={row?.g} terms={row?.r ?? 0} size="sm" />
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${course.code} from this term`}
            className="rounded p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {status.available && (
        <div className="border-t border-gray-100 px-2.5 py-1.5 dark:border-white/5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="flex flex-1 items-center gap-1 rounded py-1 text-[11px] font-semibold text-[#182B49] transition hover:underline dark:text-[#FFCD00]"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
              {open ? "Hide sections" : "Choose sections"}
            </button>
            <button
              type="button"
              onClick={onAutoPick}
              title="Pick sections that fit around the rest of your schedule"
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <Wand2 className="h-3 w-3" />
              Auto
            </button>
          </div>

          {open && (
            <div className="pb-1 pt-1.5">
              <SectionPicker sec={sec} value={selection} onChange={onSelect} compact />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default function ScheduleRail({
  selectedCourses, platRows, sectionsByCode, selections, conflictCodes,
  darkMode, roleOf, sectionStatus,
  onRemove, onSelect, onAutoPick, onClear,
}: {
  selectedCourses: ScheduleCourse[];
  platRows: CourseRow[];
  sectionsByCode: Record<string, SectionTuple[]>;
  selections: Record<string, SectionSelection>;
  conflictCodes: Set<string>;
  darkMode: boolean;
  roleOf: (course: Course) => CourseRole;
  sectionStatus: (code: string) => SectionStatus;
  onRemove: (id: string) => void;
  onSelect: (code: string, next: SectionSelection) => void;
  onAutoPick: (code: string) => void;
  onClear: () => void;
}) {
  const byCode = useMemo(() => {
    const m = new Map<string, CourseRow>();
    for (const r of platRows) m.set(r.k, r);
    return m;
  }, [platRows]);

  if (!selectedCourses.length) {
    return (
      <p className="px-3 py-8 text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        Nothing on your schedule yet.
        <br />
        Add a course from <span className="font-semibold">Browse</span> and it appears here
        with its real lecture and discussion times.
      </p>
    );
  }

  return (
    <div className="space-y-2 px-2 pb-3">
      <ul className="m-0 list-none space-y-2 p-0">
        {selectedCourses.map((entry) => {
          const code = entry.course.code;
          return (
            <CourseCard
              key={entry.id}
              entry={entry}
              row={byCode.get(code)}
              role={roleOf(entry.course)}
              sec={sectionsByCode[code] ?? []}
              status={sectionStatus(code)}
              selection={selections[code]}
              conflicted={conflictCodes.has(code)}
              darkMode={darkMode}
              onRemove={() => onRemove(entry.id)}
              onSelect={(next) => onSelect(code, next)}
              onAutoPick={() => onAutoPick(code)}
            />
          );
        })}
      </ul>

      <button
        type="button"
        onClick={onClear}
        className="w-full rounded-lg py-1.5 text-[11px] text-gray-500 transition hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-white/5"
      >
        Clear the whole term
      </button>
    </div>
  );
}

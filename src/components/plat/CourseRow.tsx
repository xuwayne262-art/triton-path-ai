"use client";

import Link from "next/link";
import { DifficultyTag, GradeBadge, RmpRating, SeatWarning } from "./Grade";
import {
  courseHref, prereqKnown, prettyRange, prettyTime, splitDays, type CourseRow as Row,
} from "@/lib/plat";
import { unitsLabel } from "@/lib/units";

/** "TuTh 9:30–10:50 AM": start and end, so two rows can be compared for a clash. */
function meetingText(row: Row): string | null {
  const days = splitDays(row.d);
  if (!days.length) return null;
  return `${days.join("")} ${row.en ? prettyRange(row.st, row.en) : prettyTime(row.st)}`;
}

/**
 * One scannable line per course, the same on every list — a department, the
 * GE lists, the home page's shelves: the course's historical average and its
 * GPA on the left, what and when in the middle, this term's listed instructor
 * and their RateMyProfessors scores on the right. Enough to compare rows
 * without opening any of them, and no more.
 *
 * The left column is the course's own history across every instructor; the
 * right column is one person — the instructor of the first lecture on this
 * term's schedule — and their scores across all of their courses. The row's
 * tooltip says which is which, and the list above it says it once in words.
 *
 * A course with several lectures says so ("2 lecture options, first: TuTh
 * 9:30–10:50 AM") and names its other instructors ("+ Benjamin Ochoa"), so
 * the first lecture is never passed off as the only one. On a phone, where
 * the right column does not fit, the instructor and rating move under the
 * title rather than disappearing. The grade letter is small: it describes the
 * course's past classes, not the course or the person.
 */
export default function CourseRow({
  row,
  note,
}: {
  row: Row;
  /** Optional one-line context, e.g. why this course was picked. */
  note?: string;
}) {
  const meeting = meetingText(row);
  const hasHistory = row.g != null && row.g > 0;

  return (
    <Link
      href={courseHref(row.k)}
      className="group flex items-center gap-3.5 border-b border-gray-100 px-3 py-3 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#182B49] dark:border-white/5 dark:hover:bg-white/5 dark:focus-visible:ring-[#FFCD00]"
    >
      <span className="flex w-9 shrink-0 flex-col items-center gap-0.5">
        <GradeBadge gpa={row.g} terms={row.r} size="sm" />
        {hasHistory && (
          <span className="text-[11px] font-semibold tabular-nums text-gray-600 dark:text-gray-400">{row.g!.toFixed(2)}</span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-mono text-xs font-bold text-[#182B49] dark:text-[#FFCD00]">{row.k}</span>
          <span className="min-w-0 text-sm font-medium group-hover:underline">
            {row.t || "Untitled course"}
          </span>
          <SeatWarning avail={row.sa} limit={row.sl} at={row.sat ?? null} />
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-600 dark:text-gray-400">
          {row.u && <span>{unitsLabel(row.u, row.t)}</span>}
          {meeting && (
            <><Dot /><span>{row.nl && row.nl > 1 ? `${row.nl} lecture options, first: ${meeting}` : meeting}</span></>
          )}
          {!row.pr && prereqKnown(row) && (
            <><Dot /><span className="text-emerald-700 dark:text-emerald-400">no prereq listed</span></>
          )}
          {hasHistory && row.r === 1 && (
            <><Dot /><span className="text-amber-800 dark:text-amber-300">limited history (1 term)</span></>
          )}
          {!hasHistory && <><Dot /><span>no grade history</span></>}
          {!row.o && (
            <><Dot /><span>{row.ct === 0 ? "not in the current catalog" : "not offered this term"}</span></>
          )}
          {note && <><Dot /><span className="text-indigo-700 dark:text-indigo-400">{note}</span></>}
        </span>
        {/* The instructor, on a phone, where the column on the right has no room. */}
        {row.p && (
          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-gray-700 sm:hidden dark:text-gray-300">
            <span className="font-medium">{row.p}</span>
            <RmpRating q={row.pq} n={row.pn} name={row.p} />
            {row.pp?.length ? <span className="text-gray-600 dark:text-gray-400">+ {row.pp.join(", ")}</span> : null}
          </span>
        )}
      </span>

      <span
        className="hidden w-44 shrink-0 text-right sm:block"
        title={row.p ? `${row.p}: the instructor of the first lecture on this term's schedule${row.pp?.length ? `; also teaching it: ${row.pp.join(", ")}` : ""}. RateMyProfessors scores are for ${row.p} across all their courses.` : undefined}
      >
        {row.p ? (
          <>
            <span className="flex items-center justify-end gap-1.5">
              <span className="truncate text-xs font-medium text-gray-800 dark:text-gray-200">{row.p}</span>
              <RmpRating q={row.pq} n={row.pn} name={row.p} />
            </span>
            {row.pp?.length ? (
              <span className="block truncate text-[11px] text-gray-600 dark:text-gray-400">
                + {row.pp.length === 1 ? row.pp[0] : `${row.pp.length} others`}
              </span>
            ) : null}
            <DifficultyTag d={row.pd} name={row.p} />
          </>
        ) : (
          <span className="text-xs text-gray-600 dark:text-gray-400">{row.o ? "Instructor not listed" : ""}</span>
        )}
      </span>
    </Link>
  );
}

const Dot = () => <span aria-hidden className="text-gray-300 dark:text-gray-600">·</span>;

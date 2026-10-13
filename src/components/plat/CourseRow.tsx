"use client";

import Link from "next/link";
import { DifficultyTag, GradeBadge, RmpRating, SeatWarning } from "./Grade";
import {
  courseHref, prereqKnown, prettyTime, splitDays, type CourseRow as Row,
} from "@/lib/plat";

/** "TuTh 9:30 AM" — compact enough to sit on the meta line. */
function meetingText(row: Row): string | null {
  const days = splitDays(row.d);
  if (!days.length) return null;
  return `${days.join("")} ${prettyTime(row.st)}`;
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
      <span className="flex w-11 shrink-0 flex-col items-center gap-0.5">
        <GradeBadge gpa={row.g} terms={row.r} />
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
          {row.u && <span>{parseFloat(row.u)} units</span>}
          {meeting && <><Dot /><span>{meeting}</span></>}
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
      </span>

      <span
        className="hidden w-44 shrink-0 text-right sm:block"
        title={row.p ? `${row.p}: the instructor of the first lecture on this term's schedule. RateMyProfessors scores are for them across all their courses.` : undefined}
      >
        {row.p ? (
          <>
            <span className="flex items-center justify-end gap-1.5">
              <span className="truncate text-xs font-medium text-gray-800 dark:text-gray-200">{row.p}</span>
              <RmpRating q={row.pq} n={row.pn} name={row.p} />
            </span>
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

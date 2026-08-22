"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { GradeBadge, LoadTag, SeatWarning } from "./Grade";
import { courseHref, prettyTime, splitDays, type CourseRow as Row } from "@/lib/plat";

/** "TuTh 9:30 AM" — compact enough to sit on the meta line. */
function meetingText(row: Row): string | null {
  const days = splitDays(row.d);
  if (!days.length) return null;
  return `${days.join("")} ${prettyTime(row.st)}`;
}

/** RateMyProfessors score, colored so a weak rating is visible at a glance. */
export function Rating({ q, n }: { q: number | null; n?: number | null }) {
  if (q == null || q <= 0) return null;
  const tone =
    q >= 4 ? "text-emerald-600 dark:text-emerald-400"
      : q >= 3 ? "text-amber-600 dark:text-amber-400"
        : "text-red-500 dark:text-red-400";
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-bold ${tone}`}
      title={n ? `${n} RateMyProfessors ratings` : undefined}
    >
      <Star className="h-3 w-3 fill-current" />
      {q.toFixed(1)}
    </span>
  );
}

/**
 * One scannable line per course: the typical grade and its GPA on the left, what
 * and when in the middle, who teaches it and how they rate on the right. Enough
 * to compare rows without opening any of them, and no more.
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

  return (
    <Link
      href={courseHref(row.k)}
      className="group flex items-center gap-3.5 border-b border-gray-100 px-3 py-3 transition hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5"
    >
      <span className="flex w-11 shrink-0 flex-col items-center gap-0.5">
        <GradeBadge gpa={row.g} terms={row.r} />
        {row.g != null && row.g > 0 && (
          <span className="text-[10px] font-semibold tabular-nums text-gray-400">{row.g.toFixed(2)}</span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-xs font-bold text-[#182B49] dark:text-[#FFCD00]">{row.k}</span>
          <span className="min-w-0 truncate text-sm font-medium group-hover:underline">
            {row.t || "Untitled course"}
          </span>
          <SeatWarning avail={row.sa} limit={row.sl} />
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500 dark:text-gray-400">
          {row.u && <span>{parseFloat(row.u)} units</span>}
          {meeting && <><Dot /><span>{meeting}</span></>}
          {!row.pr && <><Dot /><span className="text-emerald-600 dark:text-emerald-400">no prereq</span></>}
          {!row.o && <><Dot /><span>not offered this term</span></>}
          {note && <><Dot /><span className="text-indigo-600 dark:text-indigo-400">{note}</span></>}
        </span>
      </span>

      <span className="hidden w-40 shrink-0 text-right sm:block">
        {row.p ? (
          <>
            <span className="flex items-center justify-end gap-1.5">
              <span className="truncate text-xs font-medium text-gray-700 dark:text-gray-200">{row.p}</span>
              <Rating q={row.pq} n={row.pn} />
            </span>
            <LoadTag difficulty={row.pd} />
          </>
        ) : (
          <span className="text-xs text-gray-400">Instructor TBA</span>
        )}
      </span>
    </Link>
  );
}

const Dot = () => <span className="text-gray-300 dark:text-gray-600">·</span>;

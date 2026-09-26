"use client";

import { AlertTriangle, GraduationCap } from "lucide-react";
import { timeToMinutes, type SectionTuple } from "@/lib/plat";
import { ROLE_STYLES, type CourseRole } from "@/lib/plannerBridge";
// A one-off row keeps its date in the column weekly rows use for days.
import { DAYS as DATE, END, START, compactRange, oneOffLabel, sectionWhere } from "@/lib/sections";

/**
 * The dates that cannot move: every final, midterm and one-off session that
 * comes with the sections chosen. They were in the data all along, filed as
 * rows nothing read; two finals at the same hour is exactly the kind of
 * problem worth seeing while the sections can still be changed.
 */

export interface ExamItem {
  code: string;
  role: CourseRole;
  row: SectionTuple;
}

const dateLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

function overlaps(a: ExamItem, b: ExamItem): boolean {
  if (a.row[DATE] !== b.row[DATE] || a.code === b.code) return false;
  const as = timeToMinutes(a.row[START]);
  const ae = timeToMinutes(a.row[END]);
  const bs = timeToMinutes(b.row[START]);
  const be = timeToMinutes(b.row[END]);
  if (as == null || ae == null || bs == null || be == null) return false;
  return as < be && bs < ae;
}

export default function ExamList({ items }: { items: ExamItem[] }) {
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) =>
    (a.row[DATE] + (timeToMinutes(a.row[START]) ?? 0).toString().padStart(4, "0"))
      .localeCompare(b.row[DATE] + (timeToMinutes(b.row[START]) ?? 0).toString().padStart(4, "0")),
  );
  const clashing = new Set<ExamItem>();
  for (const a of sorted) for (const b of sorted) if (overlaps(a, b)) clashing.add(a);

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-gray-800">
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold">
        <GraduationCap className="h-3.5 w-3.5 text-[#182B49] dark:text-[#FFCD00]" />
        Finals &amp; midterms
        {clashing.size > 0 && (
          <span className="ml-1 flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-500/15 dark:text-red-400">
            <AlertTriangle className="h-3 w-3" /> Two exams at once
          </span>
        )}
      </h2>
      <ul className="m-0 grid list-none grid-cols-1 gap-x-6 gap-y-1 p-0 sm:grid-cols-2">
        {sorted.map((it) => (
          <li
            key={`${it.code}-${it.row[DATE]}-${it.row[START]}-${it.row[1]}`}
            className={`flex flex-wrap items-baseline gap-x-2 text-[11px] sm:flex-nowrap ${clashing.has(it) ? "font-semibold text-red-600 dark:text-red-400" : ""}`}
          >
            <span className="h-2 w-2 shrink-0 translate-y-[1px] rounded-full" style={{ background: ROLE_STYLES[it.role].hex }} />
            <span className="w-[5.5rem] shrink-0 tabular-nums">{dateLabel(it.row[DATE])}</span>
            <span className="w-[5.5rem] shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
              {compactRange(it.row[START], it.row[END])}
            </span>
            {/* On a phone the course and room take a line of their own. */}
            <span className="min-w-0 basis-full truncate pl-4 sm:basis-auto sm:pl-0">
              <span className="font-semibold">{it.code}</span> {oneOffLabel(it.row)}
              <span className="text-gray-500 dark:text-gray-400"> · {sectionWhere(it.row) || "Room TBA"}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

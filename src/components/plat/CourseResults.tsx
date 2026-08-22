"use client";

import { useMemo, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import CourseRow from "./CourseRow";
import { sortCourses, type CourseRow as Row, type SortKey } from "@/lib/plat";

export interface ResultFilters {
  q: string;
  units: string;
  offeredOnly: boolean;
  openOnly: boolean;
  noPre: boolean;
  hasGrades: boolean;
  sort: SortKey;
}

export const DEFAULT_FILTERS: ResultFilters = {
  q: "",
  units: "any",
  offeredOnly: true,
  openOnly: false,
  noPre: false,
  hasGrades: false,
  sort: "grade",
};

export function applyFilters(rows: Row[], f: ResultFilters): Row[] {
  const q = f.q.trim().toLowerCase();
  const maxUnits = f.units === "any" ? Infinity : Number(f.units);

  const filtered = rows.filter((c) => {
    if (f.offeredOnly && !c.o) return false;
    if (f.openOnly && !(c.sa != null && c.sa > 0)) return false;
    if (f.noPre && c.pr) return false;
    if (f.hasGrades && !(c.r > 0 && c.g != null && c.g > 0)) return false;
    if (maxUnits !== Infinity) {
      const u = c.u ? parseFloat(c.u) : null;
      if (u == null || u > maxUnits) return false;
    }
    if (q && !`${c.k} ${c.t} ${c.p ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  return sortCourses(filtered, f.sort);
}

/** Only these three sorts are worth surfacing by default. */
const SORTS: [SortKey, string][] = [
  ["grade", "Best grades"],
  ["code", "Course number"],
  ["rating", "Best-rated professor"],
];

const PAGE = 30;

/**
 * A results list with one visible control. Every other filter lives behind the
 * Filters button, and active ones surface as removable chips so nothing is
 * silently applied.
 */
export default function CourseResults({
  rows,
  filters,
  onChange,
  noteFor,
  emptyHint = "No courses match these filters.",
}: {
  rows: Row[];
  filters: ResultFilters;
  onChange: (f: ResultFilters) => void;
  noteFor?: (row: Row) => string | undefined;
  emptyHint?: string;
}) {
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const results = useMemo(() => applyFilters(rows, filters), [rows, filters]);

  // Paging belongs to a particular result set, so reset it during render when
  // that set changes rather than after a paint.
  const [pagedFor, setPagedFor] = useState(results);
  if (pagedFor !== results) {
    setPagedFor(results);
    setLimit(PAGE);
  }

  const set = <K extends keyof ResultFilters>(k: K, v: ResultFilters[K]) =>
    onChange({ ...filters, [k]: v });

  // Only non-default filters are worth showing back to the user.
  const chips: { label: string; clear: () => void }[] = [];
  if (!filters.offeredOnly) chips.push({ label: "Including unscheduled", clear: () => set("offeredOnly", true) });
  if (filters.openOnly) chips.push({ label: "Open seats only", clear: () => set("openOnly", false) });
  if (filters.noPre) chips.push({ label: "No prerequisite", clear: () => set("noPre", false) });
  if (filters.hasGrades) chips.push({ label: "Has grade history", clear: () => set("hasGrades", false) });
  if (filters.units !== "any") chips.push({ label: `≤ ${filters.units} units`, clear: () => set("units", "any") });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3 dark:border-white/10">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-gray-900 dark:text-gray-100">{results.length.toLocaleString()}</span>{" "}
          {results.length === 1 ? "course" : "courses"}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <select
            value={filters.sort}
            onChange={(e) => set("sort", e.target.value as SortKey)}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#182B49] dark:border-white/10 dark:bg-white/5 dark:text-gray-100"
          >
            {SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
              showFilters || chips.length
                ? "border-[#182B49] text-[#182B49] dark:border-[#FFCD00] dark:text-[#FFCD00]"
                : "border-gray-200 text-gray-600 dark:border-white/10 dark:text-gray-300"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters{chips.length ? ` (${chips.length})` : ""}
          </button>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-3">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={c.clear}
              className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600 transition hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300"
            >
              {c.label} <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      {showFilters && (
        <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <input
            value={filters.q}
            onChange={(e) => set("q", e.target.value)}
            placeholder="Narrow by code, title or professor"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#182B49] dark:border-white/10 dark:bg-white/5 dark:text-gray-100"
          />
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              Max units
              <select
                value={filters.units}
                onChange={(e) => set("units", e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-white/5 dark:text-gray-100"
              >
                <option value="any">Any</option>
                {["1", "2", "3", "4", "5", "6"].map((u) => <option key={u} value={u}>≤ {u}</option>)}
              </select>
            </label>
            <Check label="Offered this term" checked={filters.offeredOnly} onChange={(v) => set("offeredOnly", v)} />
            <Check label="Open seats only" checked={filters.openOnly} onChange={(v) => set("openOnly", v)} />
            <Check label="No prerequisite" checked={filters.noPre} onChange={(v) => set("noPre", v)} />
            <Check label="Has grade history" checked={filters.hasGrades} onChange={(v) => set("hasGrades", v)} />
          </div>
        </div>
      )}

      {results.length === 0 ? (
        <p className="py-20 text-center text-sm text-gray-400">{emptyHint}</p>
      ) : (
        <div className="mt-1">
          {results.slice(0, limit).map((c) => (
            <CourseRow key={c.k} row={c} note={noteFor?.(c)} />
          ))}
        </div>
      )}

      {limit < results.length && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE)}
          className="mt-6 w-full rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
        >
          Show {Math.min(PAGE, results.length - limit)} more
        </button>
      )}
    </div>
  );
}

function Check({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[#182B49] dark:accent-[#FFCD00]"
      />
      {label}
    </label>
  );
}

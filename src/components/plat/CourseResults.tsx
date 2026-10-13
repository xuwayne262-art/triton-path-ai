"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { SlidersHorizontal, X } from "lucide-react";
import CourseRow from "./CourseRow";
import { applyFilters, DEFAULT_FILTERS, splitByTerm, type ResultFilters } from "@/lib/courseFilters";
import type { CourseRow as Row, SortKey } from "@/lib/plat";

// The filter rules live in lib/courseFilters.ts, where they are tested; the
// pages that render this list import them from here as they always have.
export { applyFilters, DEFAULT_FILTERS, type ResultFilters } from "@/lib/courseFilters";

/**
 * Ceilings on RateMyProfessors difficulty (1–5), as the score itself. They
 * were "Light only", "Moderate or lighter" and "Heavy or lighter", names that
 * claimed a measured workload for the course; the thresholds are unchanged.
 */
const LOADS: [string, string][] = [
  ["2.2", "2.2 or lower"],
  ["3.2", "3.2 or lower"],
  ["4", "4.0 or lower"],
];

const LOAD_LABEL: Record<string, string> = Object.fromEntries(LOADS);

/** Only these three sorts are worth surfacing by default. */
const SORTS: [SortKey, string][] = [
  ["grade", "Highest historical average"],
  ["code", "Course number"],
  ["rating", "Highest RMP rating (listed instructor)"],
];

const PAGE = 30;

/**
 * A results list with one visible row of controls. Every other filter lives
 * behind the Filters button, and active ones surface as removable chips so
 * nothing is silently applied. The count is announced politely as it changes,
 * and an empty list says which criteria emptied it and offers to undo them.
 */
export default function CourseResults({
  rows,
  filters,
  onChange,
  noteFor,
  emptyHint = "No courses match these filters.",
  termName,
  loading = false,
  onResetAll,
  extraChips = [],
}: {
  rows: Row[];
  filters: ResultFilters;
  onChange: (f: ResultFilters) => void;
  noteFor?: (row: Row) => string | undefined;
  emptyHint?: string;
  /** "Fall 2026", for the switch between every course and this term's. */
  termName?: string;
  /** The rows have not arrived yet: a placeholder, never "0 courses". */
  loading?: boolean;
  /** Clears what the page itself narrowed by (a GE area, a requirement), when it offers that. */
  onResetAll?: () => void;
  /** What the page itself narrowed by, shown first among the chips so one row says everything applied. */
  extraChips?: { label: string; clear: () => void }[];
}) {
  const id = useId();
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  // Every row stays on the list; this term's courses are simply read first,
  // under a heading that says so, and the sort runs within each part.
  const { results, offeredCount } = useMemo(() => {
    const sorted = applyFilters(rows, filters);
    if (filters.offeredOnly || !termName) return { results: sorted, offeredCount: null };
    const { offered, other } = splitByTerm(sorted);
    return { results: [...offered, ...other], offeredCount: offered.length };
  }, [rows, filters, termName]);

  // Paging belongs to a particular result set, so reset it during render when
  // that set changes rather than after a paint.
  const [pagedFor, setPagedFor] = useState(results);
  if (pagedFor !== results) {
    setPagedFor(results);
    setLimit(PAGE);
  }

  const set = <K extends keyof ResultFilters>(k: K, v: ResultFilters[K]) =>
    onChange({ ...filters, [k]: v });

  // Only non-default filters are worth showing back to the user. Which term is
  // shown has its own switch in the header, so it needs no chip. The text
  // filter gets one too: typed into the panel and the panel closed, it went on
  // hiding courses with nothing on screen to say so.
  const chips: { label: string; clear: () => void }[] = [];
  if (filters.offeredOnly) chips.push({ label: `${termName ?? "This term"} only`, clear: () => set("offeredOnly", false) });
  if (filters.q.trim()) chips.push({ label: `Matching “${filters.q.trim()}”`, clear: () => set("q", "") });
  if (filters.openOnly) chips.push({ label: "Open seats at last count", clear: () => set("openOnly", false) });
  if (filters.noPre) chips.push({ label: "No prerequisite listed", clear: () => set("noPre", false) });
  if (filters.hasGrades) chips.push({ label: "Has grade history", clear: () => set("hasGrades", false) });
  if (filters.units !== "any") chips.push({ label: `≤ ${filters.units} units`, clear: () => set("units", "any") });
  if (filters.load !== "any") chips.push({ label: `RMP difficulty ${LOAD_LABEL[filters.load] ?? filters.load}`, clear: () => set("load", "any") });

  const clearFilters = () => onChange({ ...DEFAULT_FILTERS, sort: filters.sort });
  const scope = filters.offeredOnly ? `on the ${termName ?? "current"} schedule` : "in the catalog";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-4 dark:border-white/10">
        <p className="text-sm text-gray-600 dark:text-gray-400" aria-live="polite" aria-atomic="true">
          {loading ? (
            "Loading courses…"
          ) : (
            <>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{results.length.toLocaleString()}</span>{" "}
              {results.length === 1 ? "course" : "courses"} {scope}
            </>
          )}
        </p>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <div
            role="radiogroup"
            aria-label="Which courses to list"
            className="flex rounded-lg border border-gray-200 p-0.5 dark:border-white/10"
          >
            {([[false, "All courses"], [true, termName ?? "This term"]] as const).map(([only, label]) => (
              <label
                key={label}
                className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#182B49] dark:has-[:focus-visible]:ring-[#FFCD00] ${
                  filters.offeredOnly === only
                    ? "bg-[#182B49] text-white dark:bg-[#FFCD00] dark:text-[#182B49]"
                    : "text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                }`}
              >
                <input
                  type="radio"
                  name={`${id}-scope`}
                  className="sr-only"
                  checked={filters.offeredOnly === only}
                  onChange={() => set("offeredOnly", only)}
                />
                {label}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <span>Sort</span>
            <select
              value={filters.sort}
              onChange={(e) => set("sort", e.target.value as SortKey)}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-900 outline-none focus:border-[#182B49] focus-visible:ring-2 focus-visible:ring-[#182B49]/30 dark:border-white/10 dark:bg-white/5 dark:text-gray-100"
            >
              {SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-controls={`${id}-filters`}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
              showFilters || chips.length
                ? "border-[#182B49] text-[#182B49] dark:border-[#FFCD00] dark:text-[#FFCD00]"
                : "border-gray-200 text-gray-700 dark:border-white/10 dark:text-gray-300"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            Filters{chips.length ? ` (${chips.length})` : ""}
          </button>
        </div>
      </div>

      {filters.sort === "rating" && (
        <p className="pt-3 text-xs text-gray-600 dark:text-gray-400">
          Ranked by the RateMyProfessors rating of each course&rsquo;s first-listed lecture instructor this term; courses
          without one come last.
        </p>
      )}

      {chips.length + extraChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-4">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">Showing</span>
          {[...extraChips, ...chips].map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={c.clear}
              aria-label={`Remove filter: ${c.label}`}
              className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-700 transition hover:bg-gray-200 dark:bg-white/10 dark:text-gray-200"
            >
              {c.label} <X className="h-3 w-3" aria-hidden />
            </button>
          ))}
          {chips.length > 1 && (
            <button type="button" onClick={clearFilters} className="text-[11px] font-semibold text-gray-600 underline underline-offset-2 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
              Clear filters
            </button>
          )}
          {onResetAll && extraChips.length > 0 && (
            <button type="button" onClick={onResetAll} className="text-[11px] font-semibold text-gray-600 underline underline-offset-2 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
              Reset all
            </button>
          )}
        </div>
      )}

      <div id={`${id}-filters`} hidden={!showFilters} className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-white/10 dark:bg-white/[0.03]">
        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300" htmlFor={`${id}-q`}>
          Narrow these courses
        </label>
        <input
          id={`${id}-q`}
          type="search"
          value={filters.q}
          onChange={(e) => set("q", e.target.value)}
          placeholder="Code, title or instructor"
          className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#182B49] focus-visible:ring-2 focus-visible:ring-[#182B49]/30 dark:border-white/10 dark:bg-white/5 dark:text-gray-100"
        />
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
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
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span>
              RMP difficulty
              <span className="sr-only"> (the listed instructor&rsquo;s RateMyProfessors difficulty, across all their courses)</span>
            </span>
            <select
              value={filters.load}
              onChange={(e) => set("load", e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-white/5 dark:text-gray-100"
            >
              <option value="any">Any</option>
              {LOADS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </label>
          <Check label="Open seats at last count" checked={filters.openOnly} onChange={(v) => set("openOnly", v)} />
          <Check label="No prerequisite listed" checked={filters.noPre} onChange={(v) => set("noPre", v)} />
          <Check label="Has grade history" checked={filters.hasGrades} onChange={(v) => set("hasGrades", v)} />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
          Seats are UCSD Class Planner&rsquo;s last count, not live. RMP difficulty is students&rsquo; 1–5 score for the
          instructor across all their courses, so a course without a rated instructor is left out when it is set.
        </p>
      </div>

      <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">
        Letter: the course&rsquo;s historical average GPA from UCSD&rsquo;s grade archive, not a prediction. ★: this
        term&rsquo;s listed instructor&rsquo;s RateMyProfessors rating.{" "}
        <Link href="/about#letter" className="underline underline-offset-2">How these work</Link>
      </p>

      {loading ? (
        <div aria-hidden className="mt-2 space-y-px">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3.5 border-b border-gray-100 px-3 py-3 dark:border-white/5">
              <span className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5" />
              <span className="flex-1 space-y-2">
                <span className="block h-3.5 w-2/3 animate-pulse rounded bg-gray-100 dark:bg-white/5" />
                <span className="block h-3 w-1/3 animate-pulse rounded bg-gray-100 dark:bg-white/5" />
              </span>
            </div>
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-gray-700 dark:text-gray-300">{emptyHint}</p>
          {(chips.length > 0 || extraChips.length > 0) && (
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              Active: {[...extraChips, ...chips].map((c) => c.label).join(" · ")}
            </p>
          )}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {filters.q.trim() && (
              <button type="button" onClick={() => set("q", "")} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 dark:border-white/15 dark:hover:bg-white/10">
                Clear search
              </button>
            )}
            {chips.length > 0 && (
              <button type="button" onClick={() => onChange({ ...DEFAULT_FILTERS, sort: filters.sort })} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 dark:border-white/15 dark:hover:bg-white/10">
                Reset filters
              </button>
            )}
            {onResetAll && (
              <button type="button" onClick={onResetAll} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 dark:border-white/15 dark:hover:bg-white/10">
                Reset everything
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-2">
          {results.slice(0, limit).map((c, i) => (
            <div key={c.k}>
              {offeredCount != null && i === 0 && offeredCount > 0 && (
                <GroupHeading>
                  On the {termName} schedule <span className="font-normal text-gray-600 dark:text-gray-400">· {offeredCount.toLocaleString()}</span>
                </GroupHeading>
              )}
              {offeredCount != null && i === offeredCount && (
                <GroupHeading>
                  Not offered in {termName} <span className="font-normal text-gray-600 dark:text-gray-400">· {(results.length - offeredCount).toLocaleString()}</span>
                </GroupHeading>
              )}
              <CourseRow row={c} note={noteFor?.(c)} />
            </div>
          ))}
        </div>
      )}

      {!loading && limit < results.length && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE)}
          className="mt-8 w-full rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
        >
          Show {Math.min(PAGE, results.length - limit)} more of {results.length.toLocaleString()}
        </button>
      )}
    </div>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="border-b border-gray-200 bg-gray-50/80 px-3 pb-2.5 pt-5 text-xs font-bold uppercase tracking-wide text-gray-700 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-200">
      {children}
    </h3>
  );
}

function Check({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
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

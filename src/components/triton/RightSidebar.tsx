"use client";

import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";
import type { HistoryStatus } from "@/app/planner/PlannerProvider";

interface Requirement {
  category: string;
  label: string;
  targetUnits: number;
  /** Completed, planned and scheduled units together. */
  current: number;
  /** Of those, completed on the saved Academic History. */
  done: number;
}

interface DegreeProgressGroup {
  id: string;
  groupLabel: string;
  color: string;
  requirements: Requirement[];
}

interface RightSidebarProps {
  darkMode: boolean;
  degreeProgress: DegreeProgressGroup[];
  /**
   * The courses the progress counts, once each: those the saved Academic
   * History shows completed, the four-year plan, and this term's schedule.
   */
  courses: { units: number }[];
  selectedCollege: string | null;
  /** "Fall 2026", or "" before the dataset loads. */
  termName: string;
  /** Whether a saved Academic History is counted — its completed courses are in `courses`. */
  historyStatus: HistoryStatus;
  /** How many completed courses it added. */
  completedCount: number;
  onRetryHistory: () => void;
}

export default function RightSidebar({
  darkMode,
  degreeProgress,
  courses,
  selectedCollege,
  termName,
  historyStatus,
  completedCount,
  onRetryHistory,
}: RightSidebarProps) {
  const totalUnits = courses.reduce((sum, c) => sum + c.units, 0);
  // Every bar at zero used to be a dead end: nothing said what would fill them.
  const nothingCounts =
    degreeProgress.some((g) => g.requirements.length > 0) &&
    degreeProgress.every((g) => g.requirements.every((r) => r.current === 0));

  return (
    <aside
      // A phone has no room beside the plan, so progress follows it instead.
      className={`w-64 flex-shrink-0 flex flex-col border-l overflow-hidden max-md:w-full max-md:overflow-visible max-md:border-l-0 max-md:border-t ${
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
          <GraduationCap className="w-3.5 h-3.5 text-yellow-500" />
          <span
            className={`text-xs font-semibold ${
              darkMode ? "text-gray-200" : "text-gray-700"
            }`}
          >
            Degree Progress
          </span>
        </div>
        {/* A unit count against simplified targets — said here, where it is read. */}
        <p className={`mt-1 text-[10px] leading-snug ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
          An estimate from simplified unit targets, not a degree audit. Planned courses aren&rsquo;t credit until
          you pass them; check your degree audit for what counts.
        </p>
        {!selectedCollege && (
          <p
            className={`text-[10px] mt-1 ${
              darkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            Choose your college (top right) to see GE progress
          </p>
        )}
      </div>

      {/* Progress groups — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5 max-md:flex-none max-md:overflow-visible">
        {nothingCounts && historyStatus === "none" && (
          <Link
            href="/import"
            className="flex items-start gap-1.5 rounded-lg bg-[#182B49]/[0.06] px-3 py-2.5 text-xs font-semibold leading-snug text-[#182B49] transition hover:bg-[#182B49]/10 dark:bg-[#FFCD00]/10 dark:text-[#FFCD00] dark:hover:bg-[#FFCD00]/15"
          >
            <span>Import your Academic History to see your progress</span>
            <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          </Link>
        )}
        {nothingCounts && historyStatus === "saved" && (
          <p className={`rounded-lg px-3 py-2.5 text-[11px] leading-snug ${darkMode ? "bg-white/5 text-gray-300" : "bg-slate-50 text-gray-600"}`}>
            None of your completed or planned courses count toward these requirements yet. Check that your
            major and college (top right) are right.
          </p>
        )}
        {historyStatus === "failed" && (
          <p role="status" className="rounded-lg bg-amber-50 px-3 py-2.5 text-[11px] leading-snug text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            Your saved Academic History couldn&rsquo;t be loaded, so the courses you&rsquo;ve completed aren&rsquo;t
            counted here.{" "}
            <button type="button" onClick={onRetryHistory} className="font-semibold underline underline-offset-2 hover:no-underline">
              Retry
            </button>
          </p>
        )}

        {degreeProgress.map((group) => (
          <div key={group.id}>
            {/* Group label */}
            <div className="flex items-center gap-1.5 mb-2">
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${group.color}`}
              />
              {/* Wraps rather than truncates: "Eleanor Roosevelt College GE requirements" is the whole name. */}
              <span
                className={`min-w-0 text-[9px] font-bold uppercase leading-snug tracking-widest ${
                  darkMode ? "text-gray-400" : "text-gray-500"
                }`}
              >
                {group.groupLabel}
              </span>
            </div>

            {/* Requirements */}
            <div className="space-y-2 pl-3.5">
              {group.requirements.map((req) => {
                const share = (n: number) =>
                  req.targetUnits > 0 ? Math.min(100, Math.round((n / req.targetUnits) * 100)) : 0;
                const pct = share(req.current);
                const donePct = share(req.done);
                const planned = Math.max(0, req.current - req.done);
                // Met only on completed units; met on paper is "covered by plan".
                const complete = req.done >= req.targetUnits;
                const covered = !complete && req.current >= req.targetUnits;
                return (
                  <div key={req.category}>
                    <div className="flex items-start justify-between mb-0.5">
                      <span
                        className={`min-w-0 text-[10px] font-medium leading-snug ${
                          darkMode ? "text-gray-300" : "text-gray-600"
                        }`}
                      >
                        {req.label}
                      </span>
                      <span
                        className={`text-[10px] tabular-nums ml-2 flex-shrink-0 ${
                          complete
                            ? "text-green-700 font-semibold dark:text-green-400"
                            : darkMode
                            ? "text-gray-400"
                            : "text-gray-600"
                        }`}
                      >
                        {req.current}/{req.targetUnits}u
                      </span>
                    </div>
                    <div
                      className={`relative h-1 rounded-full overflow-hidden ${
                        darkMode ? "bg-gray-700" : "bg-slate-200"
                      }`}
                      role="img"
                      aria-label={`${req.label}: ${req.done} units completed${planned ? `, ${planned} planned` : ""}, of ${req.targetUnits}`}
                    >
                      {/* Planned units, pale; completed ones, solid, over them. */}
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full opacity-35 transition-all duration-500 ease-out motion-reduce:transition-none ${group.color}`}
                        style={{ width: `${pct}%` }}
                      />
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out motion-reduce:transition-none ${group.color}`}
                        style={{ width: `${donePct}%` }}
                      />
                    </div>
                    {(planned > 0 || covered) && (
                      <p className={`mt-0.5 text-[10px] leading-snug ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                        {req.done} done · {planned} planned{covered ? " — covered by your plan, not yet earned" : ""}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {degreeProgress.length === 0 && (
          <p
            className={`text-xs text-center py-4 ${
              darkMode ? "text-gray-400" : "text-gray-500"
            }`}
          >
            No requirements loaded
          </p>
        )}
      </div>

      {/* Footer stats */}
      <div
        className={`px-4 py-3 border-t flex-shrink-0 text-xs ${
          darkMode
            ? "border-gray-700 text-gray-400"
            : "border-gray-200 text-gray-500"
        }`}
      >
        <div className="flex justify-between mb-1">
          <span>Courses counted</span>
          <span className="font-semibold">{courses.length}</span>
        </div>
        <div className="flex justify-between">
          <span>Units counted</span>
          <span className="font-semibold">{totalUnits}</span>
        </div>
        {/* Says exactly what the two numbers above count, and what they leave out. */}
        <p className={`mt-1.5 text-[10px] leading-snug ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
          {historyStatus === "saved"
            ? `Counted: the ${completedCount} ${completedCount === 1 ? "course" : "courses"} you’ve completed on your saved Academic History, every course in your 4-year plan, and every course on your ${termName ? `${termName} schedule` : "schedule for this term"}. A course in more than one counts once. Transfer and AP credit isn’t counted.`
            : `Counted: every course in your 4-year plan and every course on your ${termName ? `${termName} schedule` : "schedule for this term"}. A course in both counts once.${historyStatus === "none" ? " Courses you’ve already taken count once you import your Academic History." : ""}`}
        </p>
      </div>
    </aside>
  );
}

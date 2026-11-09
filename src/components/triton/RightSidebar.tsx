"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink, GraduationCap } from "lucide-react";
import type { HistoryStatus } from "@/app/planner/PlannerProvider";
import type { HistoryTotals } from "@/lib/history/attempts";
import { DEGREE_AUDIT_URL } from "@/lib/links";

interface Requirement {
  category: string;
  label: string;
  targetUnits: number;
  /** Completed, in-progress, planned and scheduled units together. */
  current: number;
  /** Of those, completed on the saved Academic History. */
  done: number;
  /** Of those, in progress now on the saved Academic History. Not earned. */
  inProgress: number;
}

interface DegreeProgressGroup {
  id: string;
  groupLabel: string;
  color: string;
  requirements: Requirement[];
}

/** Units in each standing, kept apart so a projection never adds to what is earned. */
export interface UnitBreakdown {
  earned: number;
  inProgress: number;
  planned: number;
}

interface RightSidebarProps {
  darkMode: boolean;
  degreeProgress: DegreeProgressGroup[];
  units: UnitBreakdown;
  selectedCollege: string | null;
  /** "Fall 2026", or "" before the dataset loads. */
  termName: string;
  /** Whether a saved Academic History is counted. */
  historyStatus: HistoryStatus;
  /** Its totals as of today, when one is saved. */
  historyTotals: HistoryTotals | null;
  onRetryHistory: () => void;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function RightSidebar({
  darkMode,
  degreeProgress,
  units,
  selectedCollege,
  termName,
  historyStatus,
  historyTotals,
  onRetryHistory,
}: RightSidebarProps) {
  // Every bar at zero used to be a dead end: nothing said what would fill them.
  const nothingCounts =
    degreeProgress.some((g) => g.requirements.length > 0) &&
    degreeProgress.every((g) => g.requirements.every((r) => r.current === 0));
  const uncounted = historyTotals ? historyTotals.missingGrade + historyTotals.needsReview : 0;
  const quiet = darkMode ? "text-gray-400" : "text-gray-600";

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
        <p className={`mt-1 text-[10px] leading-snug ${quiet}`}>
          An estimate from simplified unit targets, not a degree audit. Only completed courses count as done.
          Check your{" "}
          <a
            href={DEGREE_AUDIT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-semibold underline underline-offset-2 hover:no-underline"
          >
            degree audit
            <ExternalLink aria-hidden className="h-2.5 w-2.5" />
            <span className="sr-only"> (opens UCSD&rsquo;s page in a new tab)</span>
          </a>{" "}
          for what counts.
        </p>
        {!selectedCollege && (
          <p className={`text-[10px] mt-1 ${quiet}`}>
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
            None of your completed, current or planned courses count toward these requirements yet. Check that your
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
        {uncounted > 0 && historyTotals && (
          <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-[11px] leading-snug text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            {plural(uncounted, "course")} on your Academic History {uncounted === 1 ? "isn’t" : "aren’t"} counted:
            {historyTotals.missingGrade > 0 && ` ${historyTotals.missingGrade} with no grade shown yet`}
            {historyTotals.missingGrade > 0 && historyTotals.needsReview > 0 && " and"}
            {historyTotals.needsReview > 0 && ` ${historyTotals.needsReview} that ${historyTotals.needsReview === 1 ? "needs" : "need"} a look`}.{" "}
            <Link href="/import" className="font-semibold underline underline-offset-2 hover:no-underline">Review them</Link>
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
                const nowPct = share(req.done + req.inProgress);
                const planned = Math.max(0, req.current - req.done - req.inProgress);
                // Met only on completed units; met on paper is "covered by plan".
                const complete = req.done >= req.targetUnits;
                const covered = !complete && req.current >= req.targetUnits;
                const parts = [
                  `${req.done} done`,
                  req.inProgress ? `${req.inProgress} in progress` : null,
                  planned ? `${planned} planned` : null,
                ].filter(Boolean);
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
                            : quiet
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
                      aria-label={`${req.label}: ${parts.join(", ")}, of ${req.targetUnits} units`}
                    >
                      {/* Planned units, pale; in progress, half; completed, solid, over them. */}
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full opacity-25 transition-all duration-500 ease-out motion-reduce:transition-none ${group.color}`}
                        style={{ width: `${pct}%` }}
                      />
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full opacity-60 transition-all duration-500 ease-out motion-reduce:transition-none ${group.color}`}
                        style={{ width: `${nowPct}%` }}
                      />
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out motion-reduce:transition-none ${group.color}`}
                        style={{ width: `${donePct}%` }}
                      />
                    </div>
                    {(planned > 0 || req.inProgress > 0 || covered) && (
                      <p className={`mt-0.5 text-[10px] leading-snug ${quiet}`}>
                        {parts.join(" · ")}{covered ? " · covered on paper, not yet earned" : ""}
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

      {/* Footer: the three kinds of units, never added together */}
      <div
        className={`px-4 py-3 border-t flex-shrink-0 text-xs ${
          darkMode
            ? "border-gray-700 text-gray-400"
            : "border-gray-200 text-gray-500"
        }`}
      >
        <dl className="space-y-1">
          <div className="flex justify-between">
            <dt>Completed</dt>
            <dd className="font-semibold tabular-nums">{units.earned} units</dd>
          </div>
          <div className="flex justify-between">
            <dt>In progress</dt>
            <dd className="font-semibold tabular-nums">{units.inProgress} units</dd>
          </div>
          <div className="flex justify-between">
            <dt>Planned</dt>
            <dd className="font-semibold tabular-nums">{units.planned} units</dd>
          </div>
        </dl>
        {/* Says exactly what the numbers above count, and what they leave out. */}
        <p className={`mt-1.5 text-[10px] leading-snug ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
          {historyStatus === "saved"
            ? `Completed and in progress come from your saved Academic History. Planned is your 4-year plan and your ${termName ? `${termName} schedule` : "schedule for this term"}, each course once.${historyTotals?.transferUnits ? ` Transfer and test credit (${historyTotals.transferUnits} units) isn’t counted here.` : ""}${historyTotals?.repeated.length ? " A course taken twice counts once." : ""}`
            : `Planned is your 4-year plan and your ${termName ? `${termName} schedule` : "schedule for this term"}, each course once.${historyStatus === "none" ? " Courses you’ve taken count once you import your Academic History." : ""}`}
        </p>
      </div>
    </aside>
  );
}

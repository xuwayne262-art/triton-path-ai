"use client";

import { Archive, RefreshCw } from "lucide-react";
import type { PastTerm } from "@/lib/plan/record";
import { termLabel, termRank } from "@/lib/plan/term";

/**
 * What became of "This term" when the site moved on to a new term's schedule.
 *
 * Two cases, at most one shown:
 *  - this page loaded an older schedule than the plan has moved to (a tab
 *    left open across the switch): it says so and offers a reload, since
 *    nothing here is picked or saved until then;
 *  - the schedule is empty because the last term's picks were put away: it
 *    names them, so a student does not think they were lost.
 */
export default function TermNotice({
  term, termName, newerPlanTerm, pastTerms, scheduleEmpty,
}: {
  term: string;
  termName: string;
  newerPlanTerm: string | null;
  pastTerms: Record<string, PastTerm>;
  scheduleEmpty: boolean;
}) {
  if (newerPlanTerm) {
    return (
      <p role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200 md:px-4">
        <span>
          Your plan has moved on to {termLabel(newerPlanTerm)}, but this page loaded {termName || "an earlier term"}&rsquo;s
          schedule. Nothing here is saved until you reload.
        </span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-1 rounded-md bg-amber-900/10 px-2 py-0.5 font-semibold hover:bg-amber-900/20 dark:bg-amber-200/10 dark:hover:bg-amber-200/20"
        >
          <RefreshCw className="h-3 w-3" /> Reload
        </button>
      </p>
    );
  }

  // The latest term put away before this one.
  const last = Object.keys(pastTerms)
    .filter((t) => termRank(t) < termRank(term))
    .sort((a, b) => termRank(b) - termRank(a))[0];
  const kept = last ? pastTerms[last].schedule.map((e) => e.course.code) : [];
  if (!scheduleEmpty || !kept.length) return null;

  return (
    <p role="status" className="flex items-start gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-gray-300 md:px-4">
      <Archive aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>
        Your {termLabel(last)} schedule — {kept.join(", ")} — is kept with your plan.{" "}
        {termName || "This term"} starts empty: add its courses on the Courses tab.
      </span>
    </p>
  );
}

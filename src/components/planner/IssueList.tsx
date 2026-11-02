"use client";

import { AlertTriangle } from "lucide-react";
import { issueCourses, issueText, type PlanIssue } from "@/lib/planner/issues";

/**
 * What in this term's plan needs a decision, in words, above the week. Each
 * item names what clashes or is missing and offers to open the course's
 * sections; nothing is changed until the student picks something there.
 * Works by keyboard and screen reader, and does not depend on seeing red.
 */
export default function IssueList({
  issues, onChoose, onRetry,
}: {
  issues: PlanIssue[];
  /** Opens a course's sections in the rail (and the calendar draws its options). */
  onChoose: (code: string) => void;
  onRetry: () => void;
}) {
  if (!issues.length) return null;
  const clashes = issues.filter((i) => i.kind === "overlap" || i.kind === "exam").length;
  return (
    <section aria-labelledby="plan-issues" className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
      <h2 id="plan-issues" className="flex items-center gap-1.5 text-xs font-bold">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        {issues.length} {issues.length === 1 ? "thing needs" : "things need"} a decision
        {clashes > 0 && <span className="font-normal">· {clashes} {clashes === 1 ? "clash" : "clashes"}</span>}
      </h2>
      <ul className="mt-2 space-y-1.5">
        {issues.map((i, n) => (
          <li key={n} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs leading-relaxed">
            <span className="min-w-0 flex-1">{issueText(i)}</span>
            <span className="flex flex-wrap gap-2">
              {i.kind === "unknown" && i.why === "failed" ? (
                <button type="button" onClick={onRetry} className="min-h-8 rounded-md px-2 font-semibold underline underline-offset-2">Try again</button>
              ) : i.kind === "unknown" && i.why === "unpublished" ? null : (
                issueCourses(i).map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => onChoose(code)}
                    className="min-h-8 rounded-md border border-amber-400 bg-white px-2 font-semibold hover:bg-amber-100 dark:border-amber-500/40 dark:bg-transparent dark:hover:bg-amber-500/15"
                  >
                    {i.kind === "incomplete" ? `Choose ${code} sections` : `Other ${code} sections`}
                  </button>
                ))
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

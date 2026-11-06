"use client";

import { Archive } from "lucide-react";
import type { PastTerm } from "@/lib/plan/record";
import { termLabel, termRank } from "@/lib/plan/term";

/**
 * When the quarter on screen has nothing on it yet but an earlier quarter
 * does, names what is kept there, so a student does not think it was lost.
 * Each quarter's picks are their own; the quarter picker shows them again.
 */
export default function TermNotice({
  term, termName, pastTerms, scheduleEmpty,
}: {
  term: string;
  termName: string;
  pastTerms: Record<string, PastTerm>;
  scheduleEmpty: boolean;
}) {
  // The latest quarter before this one that has picks.
  const last = Object.keys(pastTerms)
    .filter((t) => termRank(t) < termRank(term))
    .sort((a, b) => termRank(b) - termRank(a))[0];
  const kept = last ? pastTerms[last].schedule.map((e) => e.course.code) : [];
  if (!scheduleEmpty || !kept.length) return null;

  return (
    <p role="status" className="flex items-start gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-gray-300 md:px-4">
      <Archive aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>
        Your {termLabel(last)} schedule ({kept.join(", ")}) is kept with your plan; pick {termLabel(last)} above to see it.
        Nothing is on your {termName || "this quarter's"} schedule yet.
      </span>
    </p>
  );
}

"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import QuarterClock from "@/components/plat/QuarterClock";
import TermTimeline from "@/components/plat/TermTimeline";
import { useNow } from "@/components/plat/useNow";
import { panelQuarters, plannerLink, progressFor } from "@/lib/academicTimeline";

/**
 * The home page's academic calendar, one panel: the quarter under way (or
 * just ended) as the familiar navy and gold progress bar, and the next
 * quarter's enrollment dates attached beneath it.
 *
 * Both are shown whichever quarter is being browsed. The quarter picker
 * decides what search, course lists and the Planner show; this panel is
 * where the calendar is, so switching the picker leaves it as it is, and its
 * links name their own quarter (lib/academicTimeline.ts). The panel owns the
 * one rounded frame; its two parts meet at a divider, not as cards in a card.
 */
export default function AcademicTimelinePanel({ className = "" }: { className?: string }) {
  const { progress, dates } = panelQuarters();
  const now = useNow();
  const reading = progress && now ? progressFor(progress, now) : null;
  const progressLink = progress ? plannerLink(progress, reading ? !reading.started : false) : null;

  return (
    <section
      aria-label="Academic calendar"
      className={`rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#0d1420] ${className}`}
    >
      {progress && (
        <QuarterClock
          term={progress}
          embedded
          className={dates ? "rounded-t-[15px]" : "rounded-[15px]"}
          action={progressLink && (
            <Link href={progressLink.href} className="inline-flex min-h-8 items-center gap-1 font-semibold text-[#FFCD00] underline-offset-2 hover:underline">
              {progressLink.label} <ArrowRight aria-hidden className="h-3 w-3" />
            </Link>
          )}
        />
      )}
      {dates && (
        <TermTimeline
          term={dates}
          className={`${progress ? "rounded-b-[15px] border-t border-[#182B49]/20 dark:border-white/10" : "rounded-[15px]"} bg-teal-50/70 px-5 py-4 dark:bg-teal-300/[0.05]`}
        />
      )}
    </section>
  );
}

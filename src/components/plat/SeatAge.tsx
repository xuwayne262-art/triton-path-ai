"use client";

import { seatAge, seatAgeSentence, seatDay } from "@/lib/freshness";
import { useTermFeatures } from "./termFeatures";

/**
 * When a seat count was taken, beside the count: "Sep 21", "Sep 21 · old"
 * once it is more than a day old, or "count time unknown". The whole story
 * — the exact time in San Diego, how long ago, and that TSS has the live
 * number — is the tooltip and what a screen reader hears. Nothing shows
 * until the page knows the time, rather than a guess the server made.
 *
 * Where a page says once that its quarter's public schedule never dates a
 * count (a Winter 2027 course page), its counts carry no "count time
 * unknown" each; a list, which has no such note, keeps it on every count.
 */
export function SeatAgeNote({
  at, now, className = "",
}: { at: string | null; now: number | null; className?: string }) {
  const { seatTimes } = useTermFeatures();
  if (now == null) return null;
  if (!at && !seatTimes) return null;
  const age = seatAge(at, now);
  const sentence = seatAgeSentence(age, now);
  return (
    <span className={`text-[11px] leading-tight text-gray-600 dark:text-gray-400 ${className}`} title={sentence}>
      <span aria-hidden>
        {age.kind === "unknown" ? (
          "count time unknown"
        ) : (
          <>
            {seatDay(age.at)}
            {age.kind === "old" && <span className="font-semibold text-amber-700 dark:text-amber-400"> · old</span>}
          </>
        )}
      </span>
      <span className="sr-only">{sentence}</span>
    </span>
  );
}

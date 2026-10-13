"use client";

import { Star } from "lucide-react";
import { ratingTone, seatWarning, typicalGrade } from "@/lib/plat";
import { useNow } from "./useNow";
import { SeatAgeNote } from "./SeatAge";

/**
 * The historical-average letter: the average GPA UCSD's grade archive
 * published for past classes, rounded to the nearest grade point. Sized to
 * be the first thing the eye lands on in a row — but it is a summary of past
 * classes, not a forecast for anyone's quarter, and its label says so to a
 * screen reader as well as in the tooltip.
 */
export function GradeBadge({
  gpa, terms = 0, size = "md",
}: { gpa: number | null | undefined; terms?: number; size?: "xs" | "sm" | "md" | "lg" }) {
  const v = typicalGrade(gpa, terms);
  const box =
    size === "lg" ? "h-16 w-16 text-3xl"
      : size === "sm" ? "h-8 w-8 text-sm"
        : size === "xs" ? "h-6 w-7 text-xs !rounded-md"
          : "h-11 w-11 text-lg";

  if (!v || gpa == null) {
    return (
      <span
        role="img"
        aria-label="No published grade history"
        className={`${box} flex shrink-0 items-center justify-center rounded-xl bg-gray-100 font-bold text-gray-400 dark:bg-white/5 dark:text-white/30`}
        title="No published grade history — not the same as low grades"
      >
        –
      </span>
    );
  }

  const span = terms > 0 ? ` over ${terms} graded ${terms === 1 ? "term" : "terms"}` : "";
  const label = `Historical average ${v.letter} (GPA ${gpa.toFixed(2)})${span}${v.thin ? ", limited history" : ""}`;
  return (
    <span
      role="img"
      aria-label={label}
      className={`${box} relative flex shrink-0 items-center justify-center rounded-xl font-black tabular-nums ${v.tier.pill}`}
      title={`${label}. Past classes, not a prediction.`}
    >
      {v.letter}
      {v.thin && (
        <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-white dark:ring-[#0d1420]" />
      )}
    </span>
  );
}

/**
 * RateMyProfessors overall rating — of the person, across every course they
 * teach, as students reported it. Not a course measure, and a missing rating
 * is not a zero: it renders nothing, and detail views say "No RMP rating".
 */
export function RmpRating({
  q, n, name, showCount = false,
}: { q: number | null | undefined; n?: number | null; name?: string; showCount?: boolean }) {
  if (q == null || q <= 0) return null;
  const count = n ? ` from ${n} ${n === 1 ? "rating" : "ratings"}` : "";
  const label = `RateMyProfessors overall rating${name ? ` for ${name}` : ""}: ${q.toFixed(1)} out of 5${count}, across all their courses`;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${ratingTone(q)}`} title={label}>
      <Star aria-hidden className="h-3 w-3 fill-current" />
      <span className="sr-only">{label}</span>
      <span aria-hidden>{q.toFixed(1)}</span>
      {showCount && n ? <span aria-hidden className="font-normal text-gray-500 dark:text-gray-400">({n})</span> : null}
    </span>
  );
}

/**
 * RateMyProfessors difficulty, as the number students gave it. It used to be
 * read out as "Light", "Heavy" or "Brutal load", which claims a measured
 * workload for this course; it is a 1–5 score for the instructor across all
 * their courses, so it is shown as one, in a neutral colour.
 */
export function DifficultyTag({ d, name }: { d: number | null | undefined; name?: string }) {
  if (d == null || d <= 0) return null;
  return (
    <span
      className="text-xs text-gray-500 dark:text-gray-400"
      title={`RateMyProfessors difficulty${name ? ` for ${name}` : ""}: ${d.toFixed(1)} out of 5, self-reported by students across all their courses (1 easiest, 5 hardest)`}
    >
      RMP difficulty {d.toFixed(1)}
    </span>
  );
}

/**
 * Rendered only when seats actually constrain the decision, and always with
 * when they were counted: "8 left · Sep 21", or "· old" once the count is
 * more than a day old. The full time is in the tooltip and read out.
 */
export function SeatWarning({ avail, limit, at }: { avail: number | null; limit: number | null; at?: string | null }) {
  const now = useNow();
  const w = seatWarning(avail, limit);
  if (!w) return null;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1">
      <span
        className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
          w === "Full"
            ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
            : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
        }`}
      >
        {w}
      </span>
      <SeatAgeNote at={at ?? null} now={now} />
    </span>
  );
}

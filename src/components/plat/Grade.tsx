"use client";

import { seatWarning, typicalGrade, workload } from "@/lib/plat";

/**
 * The headline signal: the letter a typical student earns. Sized to be the
 * first thing the eye lands on in a row, since it is the one number that
 * answers "how did people actually do here".
 */
export function GradeBadge({
  gpa, terms = 0, size = "md",
}: { gpa: number | null | undefined; terms?: number; size?: "sm" | "md" | "lg" }) {
  const v = typicalGrade(gpa, terms);
  const box =
    size === "lg" ? "h-16 w-16 text-3xl" : size === "sm" ? "h-8 w-8 text-sm" : "h-11 w-11 text-lg";

  if (!v) {
    return (
      <span
        className={`${box} flex shrink-0 items-center justify-center rounded-xl bg-gray-100 font-bold text-gray-300 dark:bg-white/5 dark:text-white/20`}
        title="No published grade history"
      >
        –
      </span>
    );
  }

  return (
    <span
      className={`${box} relative flex shrink-0 items-center justify-center rounded-xl font-black tabular-nums ${v.tier.pill}`}
      title={`Typical grade ${v.letter}${v.thin ? " — based on a single term, treat with caution" : ""}`}
    >
      {v.letter}
      {v.thin && (
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-white dark:ring-[#0d1420]" />
      )}
    </span>
  );
}

/** Plain-language workload, from RateMyProfessors difficulty. */
export function LoadTag({ difficulty }: { difficulty: number | null | undefined }) {
  const l = workload(difficulty);
  if (!l) return null;
  return <span className={`text-xs font-medium ${l.text}`}>{l.label} load</span>;
}

/** Rendered only when seats actually constrain the decision. */
export function SeatWarning({ avail, limit }: { avail: number | null; limit: number | null }) {
  const w = seatWarning(avail, limit);
  if (!w) return null;
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
        w === "Full"
          ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
          : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
      }`}
    >
      {w}
    </span>
  );
}

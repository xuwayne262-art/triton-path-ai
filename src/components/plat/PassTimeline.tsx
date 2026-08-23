"use client";

import { useSyncExternalStore } from "react";
import { CalendarClock } from "lucide-react";
import {
  noopSubscribe, passDate, timelineServerSnapshot, timelineSnapshot,
} from "@/lib/plat";

/**
 * The enrollment cycle at a glance: each pass labelled with its date, and a bar
 * showing how far through the cycle today sits.
 *
 * Passes that have already opened are muted so the eye lands on the one still
 * ahead — that is the only date a student can still act on.
 *
 * Rendered client-side only. The bar depends on the current date, so a server
 * pass would produce markup the client immediately contradicts.
 */
export default function PassTimeline({ termName }: { termName?: string }) {
  const state = useSyncExternalStore(noopSubscribe, timelineSnapshot, timelineServerSnapshot);
  if (!state) return null;

  const { marks, progress, countdown } = state;

  return (
    <div className="mx-auto mt-8 max-w-xl">
      <p className="flex items-center justify-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <CalendarClock className="h-3.5 w-3.5" />
        {countdown ? (
          <>
            <span className="font-bold text-[#182B49] dark:text-[#FFCD00]">
              {countdown.days} {countdown.days === 1 ? "day" : "days"}
            </span>
            until {countdown.pass.label}
            {termName && <span className="text-gray-400"> · {termName}</span>}
          </>
        ) : (
          <>All {termName ?? "enrollment"} passes have opened</>
        )}
      </p>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        {marks.map(({ pass, done, next }) => (
          <span
            key={pass.label}
            className={`text-[11px] font-bold tracking-tight ${
              next
                ? "text-[#182B49] dark:text-[#FFCD00]"
                : done
                  ? "text-gray-400 dark:text-gray-500"
                  : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {pass.label} <span className="font-semibold">{passDate(pass)}</span>
          </span>
        ))}
      </div>

      <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-[#FFCD00] transition-[width] duration-500"
          style={{ width: `${(progress * 100).toFixed(2)}%` }}
        />
      </div>
    </div>
  );
}

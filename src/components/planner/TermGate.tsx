"use client";

import { Loader2, RotateCw } from "lucide-react";
import QuarterPicker from "@/components/plat/QuarterPicker";
import { chooseTerm } from "@/components/plat/useTerm";
import { termLabelFor, termsServed } from "@/lib/terms";
import type { TermStatus } from "@/lib/plan/termGate";

/**
 * What the Planner shows while the quarter asked for is not the one loaded:
 * its name, the picker, and either a wait or a way out. Nothing of the other
 * quarter is shown, so nothing of it can be fitted, cleared or exported under
 * this one's name. The plan itself is untouched; each quarter keeps its picks.
 */
export default function TermGate({
  status,
  asked,
  loaded,
  onRetry,
}: {
  status: Exclude<TermStatus, "ready">;
  /** The quarter asked for, or null before the browser has said. */
  asked: string | null;
  /** The quarter in memory, "" when none loaded yet. */
  loaded: string;
  onRetry: () => void;
}) {
  const name = asked ? termLabelFor(asked) : "This quarter";
  // The way back is the quarter that did load, else any other one served.
  const back = loaded && loaded !== asked ? loaded : termsServed().map((t) => t.code).find((c) => c !== asked) ?? null;

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-200 px-3 py-2 dark:border-white/10 md:px-4">
        <h1 className="text-sm font-bold">{name}</h1>
        <QuarterPicker label="Quarter" />
      </div>
      <div className="flex flex-1 items-start justify-center overflow-y-auto p-6">
        {status === "loading" ? (
          <p role="status" className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Loader2 aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            Loading {name}…
          </p>
        ) : (
          <div
            role="alert"
            className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
          >
            <p className="font-semibold">{name}&rsquo;s schedule didn&rsquo;t load.</p>
            <p className="mt-1">
              Nothing in your plan changed. Check your connection and try again.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#182B49] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1e3a63] dark:bg-[#FFCD00] dark:text-[#182B49] dark:hover:bg-[#FFD740]"
              >
                <RotateCw aria-hidden className="h-3.5 w-3.5" />
                Try again
              </button>
              {back && (
                <button
                  type="button"
                  onClick={() => chooseTerm(back)}
                  className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold hover:bg-amber-100 dark:border-amber-500/40 dark:hover:bg-white/10"
                >
                  Back to {termLabelFor(back)}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useRef, type KeyboardEvent } from "react";
import { AlertTriangle } from "lucide-react";
import { chooseTerm, useTerm } from "@/components/plat/useTerm";
import { useNow } from "@/components/plat/useNow";
import { todayInSanDiego } from "@/lib/housing/terms";
import { phaseLabel, termLabelFor, termPhase, termsServed } from "@/lib/terms";

/**
 * Which quarter's schedule the page shows: Fall 2026 and Winter 2027, side
 * by side, with where each is in its year. A radio group, so it is one tab
 * stop and the arrow keys move between quarters; the choice is kept for the
 * next visit and written into the address (see useTerm).
 *
 * An address naming a quarter UCSDPlans has no schedule for gets an honest
 * line and the quarters it does have, never another quarter's sections
 * under the asked-for name.
 */
export default function QuarterPicker({ className = "", label = "Quarter" }: { className?: string; label?: string }) {
  const resolved = useTerm();
  const now = useNow();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const terms = termsServed();
  const today = now ? todayInSanDiego(new Date(now)) : null;

  if (!resolved) {
    // Its size before the browser decides, so nothing below moves when it does.
    return <div className={`h-[3.25rem] ${className}`} aria-hidden />;
  }

  const index = Math.max(0, terms.findIndex((t) => t.code === resolved.term));
  const move = (to: number) => {
    const next = (to + terms.length) % terms.length;
    chooseTerm(terms[next].code);
    refs.current[next]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const keys: Record<string, number> = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: terms.length - 1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    move(keys[e.key]);
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span id="quarter-picker-label" className="text-xs font-semibold text-gray-700 dark:text-gray-300">{label}</span>
        <div
          role="radiogroup"
          aria-labelledby="quarter-picker-label"
          onKeyDown={onKeyDown}
          className="inline-flex max-w-full rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-white/10 dark:bg-white/5"
        >
          {terms.map((t, i) => {
            const on = t.code === resolved.term;
            const phase = today ? phaseLabel(termPhase(t.code, today)) : null;
            return (
              <button
                key={t.code}
                ref={(el) => { refs.current[i] = el; }}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => chooseTerm(t.code)}
                className={`min-h-10 rounded-lg px-3 py-1 text-left text-sm transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#1B2C4F] motion-reduce:transition-none dark:focus-visible:outline-[#FFC72C] ${
                  on
                    ? "bg-white font-semibold text-[#182B49] shadow-sm dark:bg-[#FFCD00] dark:text-[#182B49]"
                    : "font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                }`}
              >
                <span className="block leading-tight">{t.name}</span>
                {phase && (
                  <span className={`block text-[11px] leading-tight ${on ? "text-gray-700 dark:text-[#182B49]" : "text-gray-600 dark:text-gray-400"}`}>{phase}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      {resolved.unknown && (
        <p role="status" className="mt-2 flex max-w-2xl items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            UCSDPlans has no schedule for {termLabelFor(resolved.unknown)}. Showing {termLabelFor(resolved.term)}; pick another quarter above.
          </span>
        </p>
      )}
    </div>
  );
}

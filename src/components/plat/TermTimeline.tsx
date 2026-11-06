"use client";

import { useState } from "react";
import { ArrowUpRight, CalendarDays, ChevronDown } from "lucide-react";
import { useNow } from "@/components/plat/useNow";
import { todayInSanDiego } from "@/lib/housing/terms";
import { dayLabel } from "@/lib/plat";
import {
  TSS_URL, chronological, countdownWords, forStudents, headlineEvent, matchesAudience, timelineFor,
  type AudienceFilter, type TimelineEvent,
} from "@/lib/termTimeline";

/**
 * A quarter's enrollment dates, under the quarter's own name: the next date a
 * student can act on first, with its date written out beside any countdown,
 * then — one tap away — every date in order, with undergraduate and graduate
 * deadlines told apart. Booking opens on each student's own appointment,
 * which only TSS knows, so the card sends them there rather than guessing.
 *
 * Nothing here has a time UCSD did not publish: a date is a San Diego
 * calendar date and reads the same anywhere.
 */
export default function TermTimeline({ term, className = "" }: { term: string; className?: string }) {
  const timeline = timelineFor(term);
  const now = useNow();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<AudienceFilter>("all");
  if (!timeline) return null;
  // The countdown is the browser's; until then the card keeps its shape.
  const today = now ? todayInSanDiego(new Date(now)) : null;
  const next = today ? headlineEvent(timeline, today) : null;
  const events = chronological(timeline).filter((e) => forStudents(e) && matchesAudience(e, filter));
  const listId = `${term}-dates`;

  return (
    <section aria-labelledby={`${term}-timeline-title`} className={`rounded-2xl border border-gray-200 px-4 py-3.5 dark:border-white/10 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={`${term}-timeline-title`} className="flex items-center gap-1.5 text-sm font-semibold">
          <CalendarDays aria-hidden className="h-4 w-4 text-[#1B2C4F] dark:text-[#FFC72C]" />
          {timeline.label} · Enrollment
        </h2>
        <a
          href={TSS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-xs font-semibold text-[#1B2C4F] hover:underline dark:text-[#FFC72C]"
        >
          Your booking time is in TSS
          <ArrowUpRight aria-hidden className="h-3 w-3" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>

      <div className="mt-2 min-h-[2.75rem]" aria-live="polite">
        {today === null ? null : next ? (
          <p className="text-sm">
            <span className="font-semibold">{next.event.label}</span>
            <span className="text-gray-700 dark:text-gray-300">
              {" · "}
              <time dateTime={next.event.date!}>{dayLabel(next.event.date!)}</time>
              {next.event.end_date && <> to <time dateTime={next.event.end_date}>{dayLabel(next.event.end_date)}</time></>}
              {" · "}{countdownWords(next)}
            </span>
            <span className="mt-0.5 block text-xs text-gray-600 dark:text-gray-400">
              {next.event.audience}
              {next.alongside.length > 0 && ` · and ${next.alongside.length} more ${next.alongside.length === 1 ? "date" : "dates"} that day`}
            </span>
          </p>
        ) : (
          <p className="text-sm text-gray-700 dark:text-gray-300">Every {timeline.label} date has passed. They stay listed below.</p>
        )}
      </div>

      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="mt-1 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-[#1B2C4F] hover:underline dark:text-[#FFC72C]"
      >
        {open ? "Hide" : "All"} {timeline.label.split(" ")[0]} dates
        <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div id={listId}>
          <div role="group" aria-label="Show dates for" className="mt-2 flex flex-wrap gap-1.5">
            {(["all", "undergraduate", "graduate"] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={`min-h-8 rounded-full border px-3 text-xs font-semibold transition ${
                  filter === f
                    ? "border-[#1B2C4F] bg-[#1B2C4F] text-white dark:border-[#FFC72C] dark:bg-[#FFC72C] dark:text-[#1B2C4F]"
                    : "border-gray-200 text-gray-700 hover:border-gray-400 dark:border-white/15 dark:text-gray-300"
                }`}
              >
                {f === "all" ? "Everyone" : f === "undergraduate" ? "Undergraduates" : "Graduate students"}
              </button>
            ))}
          </div>
          <ol className="mt-3 divide-y divide-gray-100 dark:divide-white/5">
            {events.map((e) => <DateRow key={e.id} event={e} today={today} />)}
          </ol>
          <p className="mt-3 text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">
            {timeline.deadline_note} From UCSD&rsquo;s{" "}
            <a href="https://students.ucsd.edu/academics/enroll/calendar26-27.html" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">enrollment calendar</a>
            {" "}and{" "}
            <a href="https://blink.ucsd.edu/instructors/resources/academic/calendars/2026.html" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">academic calendar</a>
            , checked {dayLabel(timeline.as_of, { year: true })}. Check them before a deadline.
          </p>
        </div>
      )}
    </section>
  );
}

function DateRow({ event: e, today }: { event: TimelineEvent; today: string | null }) {
  const past = Boolean(today && e.date && (e.end_date ?? e.date) < today);
  return (
    <li className={`flex flex-col gap-0.5 py-2 text-sm sm:flex-row sm:gap-4 ${past ? "text-gray-600 dark:text-gray-400" : ""}`}>
      <span className="shrink-0 tabular-nums sm:w-36">
        {e.date ? (
          <>
            <time dateTime={e.date}>{dayLabel(e.date)}</time>
            {e.end_date && <> to <time dateTime={e.end_date}>{dayLabel(e.end_date, { weekday: false })}</time></>}
          </>
        ) : (
          <span className="italic">Date not yet published</span>
        )}
      </span>
      <span className="min-w-0">
        <span className={past ? "" : "font-medium"}>{e.label}</span>
        {past && <span className="sr-only"> (passed)</span>}
        <span className="block text-xs text-gray-600 dark:text-gray-400">{e.audience}</span>
      </span>
    </li>
  );
}

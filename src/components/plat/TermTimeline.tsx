"use client";

import { useId, useState } from "react";
import { ArrowUpRight, CalendarDays, ChevronDown } from "lucide-react";
import { useNow } from "@/components/plat/useNow";
import { usePref } from "@/components/planner/usePref";
import { quarterByKey, todayInSanDiego } from "@/lib/housing/terms";
import { dayLabel } from "@/lib/plat";
import {
  AUDIENCES, TSS_URL, audienceLine, byMonth, countdownWords, daysUntil, enrolling, monthLabel, quarterStage,
  timelineFor, timelineView, type AudienceFilter, type DateGroup, type QuarterStage, type TermTimeline as Timeline,
  type TimelineEvent,
} from "@/lib/termTimeline";

/**
 * "Winter 2027 dates": a quarter's enrollment and academic dates, compact.
 *
 * One choice at the top ("Show dates for") governs everything below it, and
 * every part is drawn from the same audience-filtered list (lib/termTimeline):
 * up to three upcoming dates, each date once with what falls on it, then all
 * of them by month on request, with past dates and dates still awaiting
 * confirmation kept apart. A run of days under way (finals) is a status, not
 * a deadline, so a deadline due the same day still shows.
 *
 * Dates are San Diego calendar dates, labelled as such, so a reader in
 * Beijing sees the same dates and the same "today". Booking opens on each
 * student's own appointment, which only TSS shows, so the card links there
 * rather than implying everyone books at once.
 */

const AUDIENCE_KEY = "ucsdplans-dates-for";
const isAudienceText = (v: string): v is AudienceFilter => v === "all" || v === "undergraduate" || v === "graduate";

/** Upcoming dates in the compact view, and events named under each before "Show all". */
const SHOWN_DATES = 3;
const SHOWN_EVENTS = 2;

export default function TermTimeline({ term, className = "" }: { term: string; className?: string }) {
  const timeline = timelineFor(term);
  const quarter = quarterByKey(term);
  const now = useNow();
  const [filter, setFilter] = usePref<AudienceFilter>(AUDIENCE_KEY, "all", isAudienceText);
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!timeline) return null;

  const season = timeline.label.split(" ")[0];
  // "Today" is the browser's; until it is known the card keeps its shape.
  const today = now ? todayInSanDiego(new Date(now)) : null;
  const view = today ? timelineView(timeline, today, filter) : null;
  const stage = today && quarter ? quarterStage(quarter, today) : null;
  const finals = view?.ongoing[0] ?? null;

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={`rounded-2xl border border-teal-200 bg-teal-50/40 px-4 py-4 dark:border-teal-300/20 dark:bg-teal-300/[0.04] ${className}`}
    >
      <h2 id={`${id}-title`} className="flex items-center gap-1.5 text-sm font-semibold">
        <CalendarDays aria-hidden className="h-4 w-4 text-teal-700 dark:text-teal-300" />
        {timeline.label} dates
      </h2>
      <p className="mt-0.5 min-h-4 text-xs text-gray-600 dark:text-gray-400">
        {stage && <>{stageText(stage)} · </>}San Diego time (PT)
      </p>

      <fieldset className="mt-3">
        <legend className="text-xs font-semibold text-gray-700 dark:text-gray-300">Show dates for</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {AUDIENCES.map((a) => (
            <label
              key={a.value}
              className={`inline-flex min-h-9 cursor-pointer items-center rounded-full border px-3 text-xs font-semibold transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-teal-700 motion-reduce:transition-none dark:has-[:focus-visible]:outline-teal-300 ${
                filter === a.value
                  ? "border-teal-700 bg-teal-700 text-white dark:border-teal-300 dark:bg-teal-300 dark:text-[#0d1420]"
                  : "border-gray-300 bg-white text-gray-700 hover:border-gray-500 dark:border-white/15 dark:bg-transparent dark:text-gray-300"
              }`}
            >
              <input
                type="radio"
                name={`${id}-audience`}
                value={a.value}
                checked={filter === a.value}
                onChange={() => setFilter(a.value)}
                className="sr-only"
              />
              {a.label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* The compact view: what is under way, then the next few dates. */}
      <div className="mt-3 min-h-[7.5rem]" aria-live="polite">
        {view && (
          <>
            {finals && (
              <p className="mb-2 rounded-lg bg-white px-3 py-2 text-sm dark:bg-white/5">
                <span className="font-semibold">Finals in progress</span>
                <span className="text-gray-700 dark:text-gray-300"> through <DateText iso={finals.end_date ?? finals.date!} /></span>
              </p>
            )}
            {view.upcoming.length > 0 ? (
              <ol className="space-y-2">
                {view.upcoming.slice(0, SHOWN_DATES).map((g, i) => (
                  <CompactGroup key={g.date} group={g} first={i === 0} today={today!} filter={filter} />
                ))}
              </ol>
            ) : (
              <p className="text-sm text-gray-700 dark:text-gray-300">
                No upcoming dated events.
                {view.pending.length > 0 && <> {pendingWords(view.pending.length)} still awaiting confirmation; they are under &ldquo;View all {season} dates&rdquo;.</>}
              </p>
            )}
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {today && enrolling(timeline, today) && (
          <a
            href={TSS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center gap-0.5 text-xs font-semibold text-teal-800 underline-offset-2 hover:underline dark:text-teal-300"
          >
            Check my booking time in TSS
            <ArrowUpRight aria-hidden className="h-3 w-3" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-all`}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-teal-800 hover:underline dark:text-teal-300"
        >
          {open ? `Hide all ${season} dates` : `View all ${season} dates`}
          <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      <div id={`${id}-all`} hidden={!open}>
        {open && view && <AllDates timeline={timeline} view={view} filter={filter} />}
      </div>
    </section>
  );
}

/** One upcoming date in the compact view: when, how soon, and up to two of its events. */
function CompactGroup({ group, first, today, filter }: { group: DateGroup; first: boolean; today: string; filter: AudienceFilter }) {
  const [all, setAll] = useState(false);
  const id = useId();
  const days = daysUntil(group.date, today);
  const isToday = days === 0;
  const shown = all ? group.events : group.events.slice(0, SHOWN_EVENTS);
  const rest = group.events.length - SHOWN_EVENTS;
  return (
    <li className={`rounded-lg px-3 py-2 ${first ? "bg-white shadow-sm ring-1 ring-teal-100 dark:bg-white/5 dark:ring-teal-300/15" : ""}`}>
      {first && (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-800 dark:text-teal-300">{isToday ? "Today" : "Next up"}</p>
      )}
      <p className="text-sm">
        <span className="font-semibold"><DateText iso={group.date} /></span>
        {!isToday && <span className="text-gray-600 dark:text-gray-400"> · {countdownWords(days)}</span>}
      </p>
      <ul id={`${id}-events`} className="mt-0.5 space-y-0.5">
        {shown.map((e) => (
          <li key={e.id} className="text-sm text-gray-800 dark:text-gray-200">
            {e.label}
            {audienceLine(e, filter) && <span className="block text-xs text-gray-600 dark:text-gray-400">{audienceLine(e, filter)}</span>}
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <button
          type="button"
          aria-expanded={all}
          aria-controls={`${id}-events`}
          onClick={() => setAll((a) => !a)}
          className="mt-1 inline-flex min-h-8 items-center text-xs font-semibold text-teal-800 hover:underline dark:text-teal-300"
        >
          {all ? "Show fewer" : `Show all ${group.events.length} deadlines for this date`}
        </button>
      )}
    </li>
  );
}

/** Every date for the audience: the guidance first, then by month, past and unconfirmed apart. */
function AllDates({ timeline, view, filter }: { timeline: Timeline; view: ReturnType<typeof timelineView>; filter: AudienceFilter }) {
  const pastCount = view.past.reduce((n, g) => n + g.events.length, 0);
  return (
    <div className="mt-3 border-t border-teal-100 pt-3 dark:border-teal-300/15">
      <p className="text-xs leading-relaxed text-gray-700 dark:text-gray-300">{timeline.deadline_note}</p>

      {view.ongoing.length > 0 && (
        <MonthBlock title="In progress">
          {view.ongoing.map((e) => <EventRow key={e.id} event={e} filter={filter} withDate />)}
        </MonthBlock>
      )}

      {byMonth(view.upcoming).map((m) => (
        <MonthBlock key={m.month} title={monthLabel(m.month)}>
          {m.groups.map((g) => <DateRows key={g.date} group={g} filter={filter} />)}
        </MonthBlock>
      ))}

      <Disclosure label={`Past dates (${pastCount})`} empty={pastCount === 0}>
        {byMonth(view.past).map((m) => (
          <MonthBlock key={m.month} title={monthLabel(m.month)} muted>
            {m.groups.map((g) => <DateRows key={g.date} group={g} filter={filter} past />)}
          </MonthBlock>
        ))}
      </Disclosure>

      <Disclosure label={`Awaiting confirmation (${view.pending.length})`} empty={view.pending.length === 0}>
        <ul className="mt-1 divide-y divide-gray-100 dark:divide-white/5">
          {view.pending.map((e) => <EventRow key={e.id} event={e} filter={filter} />)}
        </ul>
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">UCSD has not published these dates yet. They are left blank rather than guessed.</p>
      </Disclosure>

      <p className="mt-3 text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">
        From UCSD&rsquo;s{" "}
        {(timeline.sources ?? []).map((s, i, all) => (
          <span key={s.url}>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{s.title.replace(/, \d{4}–\d{2}$/, "").toLowerCase()}<span className="sr-only"> (opens in a new tab)</span></a>
            {s.updated && <> (updated {dayLabel(s.updated, { weekday: false, year: true })})</>}
            {i < all.length - 2 ? ", " : i === all.length - 2 ? " and " : ""}
          </span>
        ))}
        ; checked {dayLabel(timeline.as_of, { weekday: false, year: true })}. Check them before a deadline.
      </p>
    </div>
  );
}

function MonthBlock({ title, muted = false, children }: { title: string; muted?: boolean; children: React.ReactNode }) {
  return (
    <section className="mt-3">
      <h3 className={`text-xs font-semibold ${muted ? "text-gray-600 dark:text-gray-400" : "text-gray-900 dark:text-gray-100"}`}>{title}</h3>
      <ul className="mt-1 divide-y divide-gray-100 dark:divide-white/5">{children}</ul>
    </section>
  );
}

/** One date, written once, with each of its events under it. */
function DateRows({ group, filter, past = false }: { group: DateGroup; filter: AudienceFilter; past?: boolean }) {
  return (
    <li className={`flex flex-col gap-0.5 py-2 text-sm sm:flex-row sm:gap-4 ${past ? "text-gray-600 dark:text-gray-400" : ""}`}>
      <span className="shrink-0 tabular-nums sm:w-28">
        <DateText iso={group.date} />
        {group.events[0].end_date && <> to <DateText iso={group.events[0].end_date} weekday={false} /></>}
        {past && <span className="sr-only"> (date passed)</span>}
      </span>
      <ul className="min-w-0 flex-1 space-y-1">
        {group.events.map((e) => <EventDetail key={e.id} event={e} filter={filter} past={past} />)}
      </ul>
    </li>
  );
}

function EventRow({ event: e, filter, withDate = false }: { event: TimelineEvent; filter: AudienceFilter; withDate?: boolean }) {
  return (
    <li className="py-2 text-sm">
      {withDate && e.date && (
        <span className="block tabular-nums text-xs text-gray-600 dark:text-gray-400">
          <DateText iso={e.date} />{e.end_date && <> to <DateText iso={e.end_date} weekday={false} /></>}
        </span>
      )}
      <ul><EventDetail event={e} filter={filter} /></ul>
    </li>
  );
}

/** An event's label, who it is for when that needs saying, and where its date comes from when sources differ. */
function EventDetail({ event: e, filter, past = false }: { event: TimelineEvent; filter: AudienceFilter; past?: boolean }) {
  const who = audienceLine(e, filter);
  return (
    <li>
      <span className={past ? "" : "font-medium"}>{e.label}</span>
      {who && <span className="block text-xs text-gray-600 dark:text-gray-400">{who}</span>}
      {e.note && <span className="mt-0.5 block text-xs leading-relaxed text-gray-700 dark:text-gray-300">{e.note}</span>}
      {e.sources && e.sources.length > 0 && (
        <span className="mt-0.5 block text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">
          {e.sources.map((s, i) => (
            <span key={s.url}>
              {i > 0 && " · "}
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{s.title.replace(/, \d{4}–\d{2}$/, "")}<span className="sr-only"> (opens in a new tab)</span></a>
              : {s.says}
            </span>
          ))}
          {" "}(checked {dayLabel(e.sources[0].checked, { weekday: false, year: true })})
        </span>
      )}
    </li>
  );
}

/** A collapsed part of the full list; opening it leaves focus on its button. */
function Disclosure({ label, empty, children }: { label: string; empty: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (empty) return <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">{label}</p>;
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-gray-800 hover:underline dark:text-gray-200"
      >
        {label}
        <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>
      <div id={id} hidden={!open}>{open && children}</div>
    </div>
  );
}

/** "Sat, Nov 7", read out with its year. */
function DateText({ iso, weekday = true }: { iso: string; weekday?: boolean }) {
  return (
    <time dateTime={iso}>
      {dayLabel(iso, { weekday })}
      <span className="sr-only">, {iso.slice(0, 4)}</span>
    </time>
  );
}

function stageText(s: QuarterStage): string {
  if (s.kind === "before") return `Classes start ${dayLabel(s.classes, { year: true })}`;
  if (s.kind === "teaching") return `Week ${s.week} of ${s.of}`;
  if (s.kind === "finals") return "Finals week";
  return `Ended ${dayLabel(s.end, { year: true })}`;
}

function pendingWords(n: number): string {
  return n === 1 ? "One date is" : `${n} dates are`;
}

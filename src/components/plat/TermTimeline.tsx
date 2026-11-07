"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { ArrowRight, ArrowUpRight, CalendarDays, ChevronDown, X } from "lucide-react";
import { useNow } from "@/components/plat/useNow";
import { usePref } from "@/components/planner/usePref";
import { quarterByKey, todayInSanDiego } from "@/lib/housing/terms";
import { dayLabel } from "@/lib/plat";
import { COMPACT_EVENTS, compactDates, dateAnchorId, dateSection, plannerLink } from "@/lib/academicTimeline";
import {
  AUDIENCES, TSS_URL, audienceLine, byMonth, countdownWords, daysUntil, enrolling, monthLabel, quarterStage,
  timelineFor, timelineView, type AudienceFilter, type DateGroup, type QuarterStage, type TermTimeline as Timeline,
  type TimelineEvent, type TimelineView,
} from "@/lib/termTimeline";

/**
 * A quarter's enrollment and academic dates, as the lower half of the home
 * page's calendar panel (AcademicTimelinePanel draws the frame).
 *
 * Compact on the page: the audience choice, the next two dates with up to
 * two of their events each, and the way to every date. Every date opens in
 * a dialog rather than growing the panel: unrolled in place, the calendar
 * pushed the page's next section 2,500 pixels down and left an empty column
 * beside it. The audience choice is one stored preference, so the panel and
 * the dialog always agree, and every part is drawn from the same filtered
 * list (lib/termTimeline). A run of days under way (finals) is a status, not
 * a deadline, so a deadline due the same day still shows.
 *
 * Booking opens on each student's own appointment, which only TSS shows, so
 * the panel links there rather than implying everyone books at once.
 */

const AUDIENCE_KEY = "ucsdplans-dates-for";
const isAudienceText = (v: string): v is AudienceFilter => v === "all" || v === "undergraduate" || v === "graduate";

export default function TermTimeline({ term, className = "" }: { term: string; className?: string }) {
  const timeline = timelineFor(term);
  const quarter = quarterByKey(term);
  const now = useNow();
  const [filter, setFilter] = usePref<AudienceFilter>(AUDIENCE_KEY, "all", isAudienceText);
  // The details dialog, and the date it opened at ("Show all" for one date).
  // Several buttons open it, so the one pressed is kept, and focus goes back
  // to that one when it closes (Radix alone returns to its last trigger).
  const [details, setDetails] = useState<{ open: boolean; date: string | null }>({ open: false, date: null });
  const opener = useRef<HTMLElement | null>(null);
  const openDetails = (date: string | null, from: HTMLElement) => {
    opener.current = from;
    setDetails({ open: true, date });
  };
  const id = useId();
  if (!timeline) return null;

  const season = timeline.label.split(" ")[0];
  // "Today" is the browser's; until it is known the region keeps its shape.
  const today = now ? todayInSanDiego(new Date(now)) : null;
  const view = today ? timelineView(timeline, today, filter) : null;
  const stage = today && quarter ? quarterStage(quarter, today) : null;
  const compact = view ? compactDates(view) : null;
  const finals = view?.ongoing[0] ?? null;
  const link = plannerLink(term, stage?.kind === "before" || stage == null);

  return (
    <section aria-labelledby={`${id}-title`} className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 id={`${id}-title`} className="flex items-center gap-1.5 text-sm font-semibold">
          <CalendarDays aria-hidden className="h-4 w-4 text-teal-700 dark:text-teal-300" />
          {timeline.label} dates
        </h3>
        <Link
          href={link.href}
          className="inline-flex min-h-8 items-center gap-0.5 text-xs font-semibold text-teal-800 underline-offset-2 hover:underline dark:text-teal-300"
        >
          {link.label} <ArrowRight aria-hidden className="h-3 w-3" />
        </Link>
      </div>
      {/* Once for the whole calendar: every date in it, Fall's and Winter's, is a San Diego date. */}
      <p className="min-h-4 text-xs text-gray-700 dark:text-gray-300">{stage && <>{stageText(stage)} · </>}San Diego time (PT)</p>

      <AudienceChoice name={`${id}-audience`} filter={filter} onChange={setFilter} className="mt-2.5" />

      {/* Held at about two dates' height, so the panel keeps its size when "today" arrives. */}
      <div className="mt-3 min-h-[8.5rem]" aria-live="polite">
        {view && compact && (
          <>
            {finals && (
              <p className="mb-2 rounded-lg bg-white px-3 py-2 text-sm dark:bg-white/5">
                <span className="font-semibold">Finals in progress</span>
                <span className="text-gray-700 dark:text-gray-300"> through <DateText iso={finals.end_date ?? finals.date!} /></span>
              </p>
            )}
            {compact.groups.length > 0 ? (
              <ol className="space-y-2">
                {compact.groups.map((g, i) => (
                  <CompactGroup
                    key={g.date}
                    group={g}
                    first={i === 0}
                    today={today!}
                    filter={filter}
                    onShowAll={(from) => openDetails(g.date, from)}
                    dialogId={`${id}-details`}
                    open={details.open}
                  />
                ))}
              </ol>
            ) : (
              <p className="text-sm text-gray-700 dark:text-gray-300">
                No upcoming dated events.
                {view.pending.length > 0 && <> {pendingWords(view.pending.length)} still awaiting confirmation.</>}
              </p>
            )}
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={details.open}
          aria-controls={details.open ? `${id}-details` : undefined}
          onClick={(e) => openDetails(null, e.currentTarget)}
          className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-teal-800 hover:underline dark:text-teal-300"
        >
          View all {season} dates
          {compact && compact.moreDates > 0 && <span className="font-normal text-gray-600 dark:text-gray-400">({compact.moreDates} more)</span>}
        </button>
        <Dialog.Root open={details.open} onOpenChange={(open) => { if (!open) setDetails({ open: false, date: null }); }}>
          {view && (
            <DatesDialog
              contentId={`${id}-details`}
              timeline={timeline}
              view={view}
              stage={stage}
              filter={filter}
              onFilter={setFilter}
              focusDate={details.date}
              onReturnFocus={() => opener.current?.focus()}
            />
          )}
        </Dialog.Root>
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
      </div>
    </section>
  );
}

/** "Show dates for": one choice that governs every count and event, on the page and in the details. */
function AudienceChoice({ name, filter, onChange, className = "" }: {
  name: string; filter: AudienceFilter; onChange: (f: AudienceFilter) => void; className?: string;
}) {
  return (
    <div role="radiogroup" aria-labelledby={`${name}-label`} className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <span id={`${name}-label`} className="mr-0.5 text-xs font-semibold text-gray-700 dark:text-gray-300">Show dates for</span>
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
              name={name}
              value={a.value}
              checked={filter === a.value}
              onChange={() => onChange(a.value)}
              className="sr-only"
            />
            {a.label}
          </label>
        ))}
    </div>
  );
}

/** One upcoming date on the page: when, how soon, two of its events, and the rest in the details. */
function CompactGroup({ group, first, today, filter, onShowAll, dialogId, open }: {
  group: DateGroup; first: boolean; today: string; filter: AudienceFilter;
  onShowAll: (from: HTMLElement) => void; dialogId: string; open: boolean;
}) {
  const days = daysUntil(group.date, today);
  const isToday = days === 0;
  const rest = group.events.length - COMPACT_EVENTS;
  return (
    <li className={`rounded-lg px-3 py-2 ${first ? "bg-white shadow-sm ring-1 ring-teal-100 dark:bg-white/5 dark:ring-teal-300/15" : ""}`}>
      {first && (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-800 dark:text-teal-300">{isToday ? "Today" : "Next up"}</p>
      )}
      <p className="text-sm">
        <span className="font-semibold"><DateText iso={group.date} /></span>
        {!isToday && <span className="text-gray-600 dark:text-gray-400"> · {countdownWords(days)}</span>}
      </p>
      <ul className="mt-0.5 space-y-0.5">
        {group.events.slice(0, COMPACT_EVENTS).map((e) => (
          <li key={e.id} className="text-sm text-gray-800 dark:text-gray-200">
            {e.label}
            {audienceLine(e, filter) && <span className="block text-xs text-gray-600 dark:text-gray-400">{audienceLine(e, filter)}</span>}
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-controls={open ? dialogId : undefined}
          onClick={(e) => onShowAll(e.currentTarget)}
          className="mt-1 inline-flex min-h-8 items-center text-xs font-semibold text-teal-800 hover:underline dark:text-teal-300"
        >
          Show all {group.events.length} deadlines for {dayLabel(group.date, { weekday: false })}
        </button>
      )}
    </li>
  );
}

/**
 * Every date for the audience, in a dialog: a sheet from the bottom on a
 * phone, a panel from the right on a wider screen. Radix gives it the title,
 * Escape, focus kept inside, focus back on the button that opened it, and a
 * page behind that neither scrolls nor moves. Opened for one date, it opens
 * at that date, with focus on it.
 */
function DatesDialog({ contentId, timeline, view, stage, filter, onFilter, focusDate, onReturnFocus }: {
  contentId: string; timeline: Timeline; view: TimelineView; stage: QuarterStage | null; filter: AudienceFilter;
  onFilter: (f: AudienceFilter) => void; focusDate: string | null; onReturnFocus: () => void;
}) {
  const id = useId();
  const pastCount = view.past.reduce((n, g) => n + g.events.length, 0);
  const at = focusDate ? dateSection(view, focusDate) : null;
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
      <Dialog.Content
        id={contentId}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onReturnFocus();
        }}
        onOpenAutoFocus={(e) => {
          if (!focusDate) return;
          const target = document.getElementById(dateAnchorId(id, focusDate));
          if (!target) return;
          e.preventDefault();
          target.scrollIntoView({ block: "start" });
          target.focus({ preventScroll: true });
        }}
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl bg-white text-gray-900 shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-4 motion-reduce:animate-none sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[min(34rem,100vw)] sm:rounded-l-2xl sm:rounded-tr-none sm:data-[state=open]:slide-in-from-right-4 dark:bg-[#0f1726] dark:text-gray-100"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-white/10">
          <div className="min-w-0">
            <Dialog.Title className="flex items-center gap-1.5 text-base font-semibold">
              <CalendarDays aria-hidden className="h-4 w-4 text-teal-700 dark:text-teal-300" />
              {timeline.label} dates
            </Dialog.Title>
            <Dialog.Description className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
              {stage ? `${stageText(stage)} · ` : ""}San Diego time (PT)
            </Dialog.Description>
          </div>
          <Dialog.Close
            aria-label="Close"
            className="-mr-1 shrink-0 rounded-lg p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-teal-700 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X aria-hidden className="h-4 w-4" />
          </Dialog.Close>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-4">
          <AudienceChoice name={`${id}-audience`} filter={filter} onChange={onFilter} />
          <p className="mt-3 text-xs leading-relaxed text-gray-700 dark:text-gray-300">{timeline.deadline_note}</p>

          {view.ongoing.length > 0 && (
            <MonthBlock title="In progress">
              {view.ongoing.map((e) => (
                <li key={e.id} className="py-2 text-sm">
                  <span id={dateAnchorId(id, e.date!)} tabIndex={-1} className="block scroll-mt-2 tabular-nums text-xs text-gray-600 outline-none dark:text-gray-400">
                    <DateText iso={e.date!} />{e.end_date && <> to <DateText iso={e.end_date} weekday={false} /></>}
                  </span>
                  <ul><EventDetail event={e} filter={filter} /></ul>
                </li>
              ))}
            </MonthBlock>
          )}

          {view.upcoming.length === 0 && view.ongoing.length === 0 && (
            <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">No upcoming dated events.</p>
          )}
          {byMonth(view.upcoming).map((m) => (
            <MonthBlock key={m.month} title={monthLabel(m.month)}>
              {m.groups.map((g) => <DateRows key={g.date} group={g} filter={filter} anchor={dateAnchorId(id, g.date)} />)}
            </MonthBlock>
          ))}

          <Disclosure label={`Past dates (${pastCount})`} empty={pastCount === 0} startOpen={at === "past"}>
            {byMonth(view.past).map((m) => (
              <MonthBlock key={m.month} title={monthLabel(m.month)} muted>
                {m.groups.map((g) => <DateRows key={g.date} group={g} filter={filter} anchor={dateAnchorId(id, g.date)} past />)}
              </MonthBlock>
            ))}
          </Disclosure>

          <Disclosure label={`Awaiting confirmation (${view.pending.length})`} empty={view.pending.length === 0}>
            <ul className="mt-1 divide-y divide-gray-100 dark:divide-white/5">
              {view.pending.map((e) => <li key={e.id} className="py-2 text-sm"><ul><EventDetail event={e} filter={filter} /></ul></li>)}
            </ul>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">UCSD has not published these dates yet. They are left blank rather than guessed.</p>
          </Disclosure>

          <p className="mt-5 text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">
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
      </Dialog.Content>
    </Dialog.Portal>
  );
}

function MonthBlock({ title, muted = false, children }: { title: string; muted?: boolean; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className={`text-xs font-semibold ${muted ? "text-gray-600 dark:text-gray-400" : "text-gray-900 dark:text-gray-100"}`}>{title}</h3>
      <ul className="mt-1 divide-y divide-gray-100 dark:divide-white/5">{children}</ul>
    </section>
  );
}

/** One date, written once, with each of its events under it. */
function DateRows({ group, filter, anchor, past = false }: { group: DateGroup; filter: AudienceFilter; anchor: string; past?: boolean }) {
  return (
    <li className={`flex flex-col gap-0.5 py-2 text-sm sm:flex-row sm:gap-4 ${past ? "text-gray-600 dark:text-gray-400" : ""}`}>
      <span id={anchor} tabIndex={-1} className="shrink-0 scroll-mt-2 rounded tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-teal-700 sm:w-28">
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
function Disclosure({ label, empty, startOpen = false, children }: { label: string; empty: boolean; startOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(startOpen);
  const id = useId();
  if (empty) return <p className="mt-4 text-xs text-gray-600 dark:text-gray-400">{label}</p>;
  return (
    <div className="mt-4">
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

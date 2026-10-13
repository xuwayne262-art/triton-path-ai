"use client";

import { useSyncExternalStore } from "react";
import { ArrowUpRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { daysBetween } from "@/lib/housing/terms";
import { dayLabel } from "@/lib/plat";
import { positionOf, readClock, splitDuration, type ClockReading, type Milestone } from "@/lib/quarterClock";

/**
 * The quarter at a glance: which week it is, how much of it has gone by, and
 * the next date the Registrar's calendar names, along a bar marked with
 * those dates. It keeps the site's navy and gold, but it is context for the
 * page, not its subject — the search above it is what a visit is for — so it
 * is one compact strip, with one decimal of progress, and it changes by the
 * minute rather than rolling digits every second. Nothing in it moves on its
 * own; the bar's position eases only when the minute turns, and not at all
 * for anyone whose system asks for reduced motion.
 *
 * All of the arithmetic is in lib/quarterClock.ts, where it is tested.
 */

// ── One shared clock, a tick a minute ─────────────────────────────────────
let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function tick() {
  now = Date.now();
  for (const listener of listeners) listener();
}

function onVisibility() {
  if (document.visibilityState === "visible") tick();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    now = Date.now();
    timer = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", onVisibility);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    clearInterval(timer);
    timer = undefined;
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

const getSnapshot = () => now;
const getServerSnapshot = () => 0;

/** The academic year's calendar on blink.ucsd.edu: 2026.html holds Fall 2026 to Spring 2027. */
function calendarUrl(key: string): string {
  const yy = Number(key.slice(2));
  const firstYear = 2000 + (key.startsWith("FA") ? yy : yy - 1);
  return `https://blink.ucsd.edu/instructors/resources/academic/calendars/${firstYear}.html`;
}

const FRAME =
  "relative isolate overflow-hidden rounded-2xl px-5 py-4 text-white ring-1 ring-white/10 " +
  "bg-[linear-gradient(135deg,#0a1630_0%,#10224a_52%,#182B49_100%)] dark:ring-[#FFCD00]/15";

export default function QuarterClock({ className = "" }: { className?: string }) {
  const t = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!t) return <Placeholder className={className} />;
  const reading = readClock(t);
  // Past the last quarter the calendar lists, there is nothing true to show.
  if (!reading) return null;
  return <Strip r={reading} className={className} />;
}

function Strip({ r, className }: { r: ClockReading; className: string }) {
  const at = (iso: string) => positionOf(iso, r.start, r.end) * 100;
  const finals = r.milestones.find((m) => m.kind === "finals");
  const markers = r.milestones.filter((m) => m.kind === "instruction" || m.kind === "holiday" || m.kind === "last-class");
  const daysToStart = daysBetween(r.today, r.quarter.begins);
  const percent = (r.fraction * 100).toFixed(1);
  const next = r.next && !(r.stage?.kind === "finals" && r.next.kind === "finals") ? upNext(r.next, r.today) : null;

  return (
    <section aria-labelledby="quarter-title" className={`${FRAME} ${className}`}>
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 -z-10 h-48 w-48 rounded-full bg-[#FFCD00]/20 blur-3xl" />

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="quarter-title" className="text-[15px] font-semibold tracking-tight">
          {r.quarter.name}
          {r.stage && <span className="ml-2 font-medium text-white/75">· {stageText(r.stage)}</span>}
        </h2>
        <p className="text-sm tabular-nums text-white/85">
          {r.started ? (
            <><span className="font-semibold text-[#FFCD00]">{percent}%</span> gone · {toGo(r.remaining)} to go</>
          ) : (
            <>Begins {dayLabel(r.quarter.begins)}, in {daysToStart} {daysToStart === 1 ? "day" : "days"}</>
          )}
        </p>
      </div>

      {/* ── The quarter as a bar, its named days marked ─────────────────── */}
      <div className="relative mt-6">
        <div className="pointer-events-none absolute inset-x-0 -top-6 h-6">
          {markers.map((m) => (
            <Marker key={`${m.kind}-${m.from}`} m={m} left={(at(m.from) + at(nextDayOf(m.to))) / 2} upcoming={r.next === m} />
          ))}
        </div>
        <div className="relative h-1.5 rounded-full bg-white/15">
          {finals && (
            <div
              title={`${finals.label}, ${dayLabel(finals.from)} – ${dayLabel(finals.to)}`}
              className="absolute inset-y-0 right-0 rounded-r-full bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.2)_0_2px,transparent_2px_6px)]"
              style={{ left: `${at(finals.from)}%` }}
            />
          )}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#8a6800,#FFCD00_60%,#FFF0B0)] transition-[width] duration-700 ease-out motion-reduce:transition-none"
            style={{ width: `${r.fraction * 100}%` }}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
        {next ? (
          <p className="text-white/85">
            <span className="font-semibold text-[#FFCD00]">{next.label}:</span> {next.value}, {next.sub}
          </p>
        ) : <span />}
        <a
          href={calendarUrl(r.quarter.key)}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-white/70 underline-offset-2 transition hover:text-white hover:underline"
        >
          Dates: UCSD Academic Calendar <ArrowUpRight aria-hidden className="h-3 w-3" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
      <p className="sr-only">
        {r.started
          ? `${percent}% of ${r.quarter.name} has gone by; ${toGo(r.remaining)} to go.`
          : `${r.quarter.name} begins ${dayLabel(r.quarter.begins)}, in ${daysToStart} ${daysToStart === 1 ? "day" : "days"}.`}
      </p>
    </section>
  );
}

/** A named day on the bar: a small dot, gold when it is the next one, a 24px target for its date. */
function Marker({ m, left, upcoming }: { m: Milestone; left: number; upcoming: boolean }) {
  const when = m.to !== m.from ? `${dayLabel(m.from)} – ${dayLabel(m.to)}` : dayLabel(m.from);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${m.label}, ${when}`}
          className="group pointer-events-auto absolute top-0 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#FFCD00]"
          style={{ left: `${left}%` }}
        >
          <span className={`block rounded-full ${upcoming ? "h-2 w-2 bg-[#FFCD00]" : "h-1.5 w-1.5 bg-white/60 group-hover:bg-white"}`} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        <span className="font-semibold">{m.label}</span> · {when}
      </TooltipContent>
    </Tooltip>
  );
}

/** "Week 3 of 10", or where the quarter is outside the numbered weeks. */
function stageText(s: NonNullable<ClockReading["stage"]>): string {
  if (s.kind === "before-instruction") return "Before instruction";
  if (s.kind === "finals") return "Finals week";
  return `Week ${s.week} of ${s.of}`;
}

/** The time left in the unit it is best read in: "60 days", and on the last day "5 hours". */
function toGo(ms: number): string {
  const d = splitDuration(ms);
  if (d.days) return `${d.days} ${d.days === 1 ? "day" : "days"}`;
  if (d.hours) return `${d.hours} ${d.hours === 1 ? "hour" : "hours"}`;
  return d.minutes ? `${d.minutes} min` : "under a minute";
}

/** "Up next" Veterans Day Holiday, "Wed, Nov 11" — or, for the one under way, "Now". */
function upNext(m: Milestone, today: string): { label: string; value: string; sub: string } {
  const range = m.to !== m.from;
  if (m.from <= today) return { label: "Now", value: m.label, sub: range ? `through ${dayLabel(m.to)}` : "today" };
  return { label: "Up next", value: m.label, sub: range ? `${dayLabel(m.from)} – ${dayLabel(m.to)}` : dayLabel(m.from) };
}

/** The date after `iso`, for centring a marker on a run of days. */
function nextDayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** The strip's outline, so nothing below moves when the time arrives. */
function Placeholder({ className }: { className: string }) {
  return (
    <section aria-label="Quarter progress" className={`${FRAME} ${className}`}>
      <div className="h-[22px] w-48 animate-pulse rounded bg-white/10 motion-reduce:animate-none" />
      <div className="mt-6 h-1.5 rounded-full bg-white/10" />
      <div className="mt-3 h-4 w-64 rounded bg-white/[0.06]" />
    </section>
  );
}

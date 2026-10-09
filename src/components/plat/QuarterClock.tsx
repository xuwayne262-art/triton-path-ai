"use client";

import { Fragment, useSyncExternalStore } from "react";
import { ArrowUpRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { daysBetween } from "@/lib/housing/terms";
import { dayLabel } from "@/lib/plat";
import {
  positionOf, readClock, sanDiegoTime, splitDuration, weekStarts,
  type ClockReading, type Milestone,
} from "@/lib/quarterClock";

/**
 * The quarter, live: how much of it has gone by, to the second, on San
 * Diego's clock, along a bar marked with the days the Registrar's calendar
 * names. It is the one designed object on the home page — meant to be looked
 * at — so it has the depth and motion the rest of the site leaves out, and
 * gives the motion up for anyone whose system asks for reduced motion.
 *
 * All of the arithmetic is in lib/quarterClock.ts, where it is tested.
 */

// ── One shared clock ──────────────────────────────────────────────────────
// Every reader sees the same instant, refreshed just after each whole second
// so the seconds change when the second does, and at once when a hidden tab
// comes back. The server has no "now" worth showing, so it draws a placeholder.

let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

function schedule() {
  timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 8);
}

function tick() {
  now = Date.now();
  for (const listener of listeners) listener();
  schedule();
}

function onVisibility() {
  if (document.visibilityState !== "visible") return;
  clearTimeout(timer);
  tick();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    now = Date.now();
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    clearTimeout(timer);
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

/** The card's frame, shared by the live clock and its placeholder. */
const FRAME =
  "relative isolate overflow-hidden rounded-3xl p-6 text-white ring-1 ring-white/10 sm:p-8 " +
  "bg-[linear-gradient(135deg,#0a1630_0%,#10224a_52%,#182B49_100%)] " +
  "shadow-[0_30px_80px_-32px_rgba(10,22,48,0.8)] dark:ring-[#FFCD00]/15";

export default function QuarterClock({ className = "" }: { className?: string }) {
  const t = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!t) return <Placeholder className={className} />;
  const reading = readClock(t);
  // Past the last quarter the calendar lists, there is nothing true to show.
  if (!reading) return null;
  return <Face r={reading} now={t} className={className} />;
}

function Face({ r, now: t, className }: { r: ClockReading; now: number; className: string }) {
  const [season, year] = r.quarter.name.split(" ");
  const [whole, decimals] = (r.fraction * 100).toFixed(4).split(".");
  const gone = splitDuration(r.elapsed);
  const left = splitDuration(r.remaining);
  const at = (iso: string) => positionOf(iso, r.start, r.end) * 100;
  const finals = r.milestones.find((m) => m.kind === "finals");
  const markers = r.milestones.filter((m) => m.kind === "instruction" || m.kind === "holiday" || m.kind === "last-class");
  const daysToStart = daysBetween(r.today, r.quarter.begins);

  return (
    <section aria-labelledby="quarter-clock-title" className={`${FRAME} ${className}`}>
      <Backdrop />

      {/* ── Title and the live San Diego time ─────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <p id="quarter-clock-title" className="text-4xl font-black uppercase leading-none tracking-[0.14em] sm:text-5xl">
          {season}{" "}
          <span className="bg-gradient-to-br from-[#FFF0B0] via-[#FFCD00] to-[#E0A400] bg-clip-text text-transparent">
            {year}
          </span>
        </p>
        <p className="inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-3 py-1.5 text-xs text-white/80 ring-1 ring-white/15 backdrop-blur">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70 motion-reduce:hidden" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="font-semibold uppercase tracking-[0.2em]">Live</span>
          <span aria-hidden className="text-white/30">·</span>
          <span className="tabular-nums">San Diego {sanDiegoTime(t)}</span>
        </p>
      </div>

      {/* ── The figure ───────────────────────────────────────────────────── */}
      <div className="mt-8">
        {r.started ? (
          <>
            <p aria-hidden className="flex items-end text-5xl font-black tabular-nums tracking-tight sm:text-6xl">
              <Roll value={whole} />
              <Roll value={`.${decimals}`} className="text-[#FFCD00]" />
              <Roll value="%" className="ml-1 text-white/45" />
            </p>
            <p className="mt-3 text-sm text-white/70">of {r.quarter.name} has gone by</p>
          </>
        ) : (
          <>
            <p aria-hidden className="flex items-end text-5xl font-black tabular-nums tracking-tight sm:text-6xl">
              <Roll value={String(daysToStart)} />
              <Roll value={daysToStart === 1 ? " day" : " days"} className="ml-1 text-white/45" />
            </p>
            <p className="mt-3 text-sm text-white/70">
              until {r.quarter.name} begins, {dayLabel(r.quarter.begins)}
            </p>
          </>
        )}
        <p className="sr-only">
          {r.started
            ? `${(r.fraction * 100).toFixed(1)}% of ${r.quarter.name} has gone by; ${left.days} days left.`
            : `${r.quarter.name} begins ${dayLabel(r.quarter.begins)}, in ${daysToStart} days.`}
        </p>
      </div>

      {/* ── The quarter as a bar ─────────────────────────────────────────── */}
      <div className="relative mt-10">
        {/* The calendar's named days, above the bar: hover or focus one for its date. */}
        <div className="pointer-events-none absolute inset-x-0 -top-5 h-3">
          {markers.map((m) => (
            <Marker key={`${m.kind}-${m.from}`} m={m} left={(at(m.from) + at(nextDayOf(m.to))) / 2} upcoming={r.next === m} />
          ))}
        </div>

        <div className="relative h-3 rounded-full bg-white/[0.08] ring-1 ring-inset ring-white/10">
          {finals && (
            <div
              title={`${finals.label}, ${dayLabel(finals.from)} – ${dayLabel(finals.to)}`}
              className="absolute inset-y-0 right-0 rounded-r-full bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.22)_0_2px,transparent_2px_6px)]"
              style={{ left: `${at(finals.from)}%` }}
            />
          )}
          {weekStarts(r.quarter).map((d) => (
            <span key={d} aria-hidden className="absolute top-1/2 h-1.5 w-px -translate-y-1/2 bg-white/25" style={{ left: `${at(d)}%` }} />
          ))}
          <div
            className="absolute inset-y-0 left-0 overflow-hidden rounded-full bg-[linear-gradient(90deg,#8a6800,#FFCD00_55%,#FFF0B0)] shadow-[0_0_18px_rgba(255,205,0,0.55)] transition-[width] duration-1000 ease-out motion-reduce:transition-none"
            style={{ width: `${r.fraction * 100}%` }}
          >
            <span className="absolute inset-y-0 left-0 w-1/4 animate-clock-sheen bg-gradient-to-r from-transparent via-white/70 to-transparent motion-reduce:hidden" />
          </div>
          {r.started && (
            <span
              aria-hidden
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-1000 ease-out motion-reduce:transition-none"
              style={{ left: `${r.fraction * 100}%` }}
            >
              <span className="absolute inset-0 animate-ping rounded-full bg-[#FFCD00]/50 motion-reduce:hidden" />
              <span className="relative block h-4 w-4 rounded-full border-2 border-white bg-[#FFCD00] shadow-[0_0_0_4px_rgba(255,205,0,0.2),0_0_22px_6px_rgba(255,205,0,0.5)]" />
            </span>
          )}
        </div>

        <div className="mt-3 flex justify-between gap-4 text-xs text-white/55">
          <span>{r.started ? "Began" : "Begins"} {dayLabel(r.quarter.begins)}</span>
          <span>Ends {dayLabel(r.quarter.end)}</span>
        </div>
      </div>

      {/* ── Time gone by and to go ───────────────────────────────────────── */}
      <div className="mt-9 grid gap-7 sm:grid-cols-2">
        {r.started && <Counter label="Gone by" d={gone} />}
        <Counter label={r.started ? "To go" : "Until it begins"} d={left} accent />
      </div>

      {/* ── Where the quarter is, and what comes next ────────────────────── */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-white/10 pt-5">
        <p className="text-sm text-white/75">
          {r.started && <span className="font-semibold text-white">{stageText(r)}</span>}
          {r.started && r.next && <span aria-hidden className="px-2 text-white/30">·</span>}
          {r.next && nextText(r.next, r.today)}
        </p>
        <a
          href={calendarUrl(r.quarter.key)}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex shrink-0 items-center gap-1 text-xs text-white/50 transition hover:text-white"
        >
          Dates: UCSD Academic Calendar <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>
    </section>
  );
}

/** Depth behind the card: a slow gold glow, a cool one opposite, a fading dot grid, a lit top edge. */
function Backdrop() {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-32 -z-10 h-80 w-80 animate-clock-drift rounded-full bg-[#FFCD00]/25 blur-3xl motion-reduce:animate-none" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-28 -z-10 h-96 w-96 rounded-full bg-[#3b82f6]/20 blur-3xl" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-70 [background-image:radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:20px_20px] [mask-image:linear-gradient(180deg,black,transparent_80%)]"
      />
      <div aria-hidden className="pointer-events-none absolute inset-x-10 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent" />
    </>
  );
}

/** A named day on the bar: a small diamond, gold when it is the next one. */
function Marker({ m, left, upcoming }: { m: Milestone; left: number; upcoming: boolean }) {
  const when = m.to !== m.from ? `${dayLabel(m.from)} – ${dayLabel(m.to)}` : dayLabel(m.from);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${m.label}, ${when}`}
          className="pointer-events-auto absolute top-0 -translate-x-1/2 rounded-sm p-1 outline-none focus-visible:ring-2 focus-visible:ring-[#FFCD00]"
          style={{ left: `${left}%` }}
        >
          <span
            className={`block h-2 w-2 rotate-45 rounded-[2px] transition ${
              upcoming ? "bg-[#FFCD00] shadow-[0_0_10px_2px_rgba(255,205,0,0.6)]" : "bg-white/60 hover:bg-white"
            }`}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        <span className="font-semibold">{m.label}</span> · {when}
      </TooltipContent>
    </Tooltip>
  );
}

/** Days, hours, minutes and seconds, each in rolling digits over its unit. */
function Counter({
  label, d, accent = false,
}: { label: string; d: ReturnType<typeof splitDuration>; accent?: boolean }) {
  const groups: [number, string][] = [[d.days, "days"], [d.hours, "hrs"], [d.minutes, "min"], [d.seconds, "sec"]];
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/50">{label}</p>
      <div aria-hidden className={`mt-3 flex items-start gap-2 font-mono text-3xl font-semibold tabular-nums ${accent ? "text-[#FFE58A]" : "text-white"}`}>
        {groups.map(([n, unit], i) => (
          <Fragment key={unit}>
            {i > 0 && <span className="leading-none text-white/25">:</span>}
            <span className="flex flex-col items-center">
              <Roll value={String(n).padStart(2, "0")} />
              <span className="mt-2 font-sans text-[10px] font-medium uppercase tracking-[0.2em] text-white/40">{unit}</span>
            </span>
          </Fragment>
        ))}
      </div>
      <p className="sr-only">
        {d.days} days, {d.hours} hours, {d.minutes} minutes {label.toLowerCase()}
      </p>
    </div>
  );
}

const DIGITS = "0123456789";

/**
 * Characters set in fixed one-em cells; each digit is a column of 0–9 that
 * slides to its value, so a changing digit rolls like an odometer. Every
 * character shares the cell, so mixed digits and symbols stay on one line.
 */
function Roll({ value, className = "" }: { value: string; className?: string }) {
  return (
    <span className={`inline-flex ${className}`}>
      {value.split("").map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} className="relative block h-[1em] w-[1ch] overflow-hidden leading-none">
            <span
              className="absolute inset-x-0 top-0 flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
              style={{ transform: `translateY(-${Number(ch) * 10}%)` }}
            >
              {DIGITS.split("").map((x) => (
                <span key={x} className="block h-[1em] leading-none">{x}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={i} className="block h-[1em] whitespace-pre leading-none">{ch}</span>
        ),
      )}
    </span>
  );
}

function stageText(r: ClockReading): string {
  const s = r.stage;
  if (!s) return r.quarter.name;
  if (s.kind === "before-instruction") return "Before instruction";
  if (s.kind === "finals") return "Finals week";
  return `Week ${s.week} of ${s.of}`;
}

/** "Next: Veterans Day Holiday, Wed, Nov 11 · in 33 days", or "Now: Final exams, through Sat, Dec 12". */
function nextText(m: Milestone, today: string): string {
  const range = m.to !== m.from;
  if (m.from <= today) return `Now: ${m.label}${range ? `, through ${dayLabel(m.to)}` : ""}`;
  const days = daysBetween(today, m.from);
  const when = range ? `${dayLabel(m.from)} – ${dayLabel(m.to)}` : dayLabel(m.from);
  return `Next: ${m.label}, ${when} · ${days === 1 ? "tomorrow" : `in ${days} days`}`;
}

/** The date after `iso`, for centring a marker on a run of days. */
function nextDayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function Placeholder({ className }: { className: string }) {
  return (
    <section aria-label="Quarter clock" className={`${FRAME} min-h-[25rem] ${className}`}>
      <Backdrop />
      <div className="h-11 w-56 animate-pulse rounded-lg bg-white/10" />
      <div className="mt-8 h-14 w-72 animate-pulse rounded-lg bg-white/10" />
      <div className="mt-12 h-3 animate-pulse rounded-full bg-white/10" />
      <div className="mt-12 h-16 animate-pulse rounded-lg bg-white/[0.06]" />
    </section>
  );
}

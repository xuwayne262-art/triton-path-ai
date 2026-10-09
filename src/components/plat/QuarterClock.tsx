"use client";

import { useSyncExternalStore } from "react";
import { ArrowUpRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { daysBetween } from "@/lib/housing/terms";
import { dayLabel } from "@/lib/plat";
import {
  positionOf, readClock, splitDuration,
  type ClockReading, type Milestone,
} from "@/lib/quarterClock";

/**
 * The quarter, live: how much of it has gone by, on San Diego's clock, along a
 * bar marked with the days the Registrar's calendar names. It is the one
 * designed object on the home page — meant to be looked at — so it has the
 * depth and motion the rest of the site leaves out, and gives the motion up
 * for anyone whose system asks for reduced motion.
 *
 * It is laid out the way Apple lays out a widget: the quarter and its week
 * across the top, one figure set large, two quiet facts beside it, and the
 * bar. Anything more is another figure for the eye to weigh, which is why the
 * time gone and the time left are not both counted to the second.
 *
 * All of the arithmetic is in lib/quarterClock.ts, where it is tested.
 */

// ── One shared clock ──────────────────────────────────────────────────────
// Every reader sees the same instant, refreshed just after each whole second
// so a changing digit changes when the second does, and at once when a hidden
// tab comes back. The server has no "now" worth showing, so it draws a placeholder.

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
  "relative isolate overflow-hidden rounded-[28px] p-7 text-white ring-1 ring-white/10 sm:p-9 " +
  "bg-[linear-gradient(135deg,#0a1630_0%,#10224a_52%,#182B49_100%)] " +
  "shadow-[0_30px_80px_-32px_rgba(10,22,48,0.8)] dark:ring-[#FFCD00]/15";

/**
 * The large figure's two sizes. Its decimals, the % sign and "days" are set at
 * the smaller, lifted by mb-[0.19em] onto the large digits' baseline.
 */
const FIGURE = "text-[76px] sm:text-[96px]";
const FIGURE_SMALL = "text-[34px] sm:text-[44px]";

export default function QuarterClock({ className = "" }: { className?: string }) {
  const t = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!t) return <Placeholder className={className} />;
  const reading = readClock(t);
  // Past the last quarter the calendar lists, there is nothing true to show.
  if (!reading) return null;
  return <Face r={reading} className={className} />;
}

function Face({ r, className }: { r: ClockReading; className: string }) {
  const [season, year] = r.quarter.name.split(" ");
  const [whole, decimals] = (r.fraction * 100).toFixed(4).split(".");
  const at = (iso: string) => positionOf(iso, r.start, r.end) * 100;
  const finals = r.milestones.find((m) => m.kind === "finals");
  const markers = r.milestones.filter((m) => m.kind === "instruction" || m.kind === "holiday" || m.kind === "last-class");
  const daysToStart = daysBetween(r.today, r.quarter.begins);
  // In finals week, "Finals week" above already says what "Now: Final exams" would.
  const next = r.next && !(r.stage?.kind === "finals" && r.next.kind === "finals") ? upNext(r.next, r.today) : null;
  const facts: FactProps[] = r.started
    ? [{ label: "To go", value: toGo(r.remaining) }, ...(next ? [{ ...next, accent: true }] : [])]
    : beforeItBegins(r.milestones);

  return (
    <section aria-labelledby="quarter-clock-title" className={`${FRAME} ${className}`}>
      <Backdrop />

      {/* ── The quarter, and the week of it ──────────────────────────────── */}
      <div className="flex items-baseline justify-between gap-4">
        <p id="quarter-clock-title" className="text-2xl font-semibold leading-tight tracking-tight sm:text-[28px]">
          {season}{" "}
          <span className="bg-gradient-to-br from-[#FFF0B0] via-[#FFCD00] to-[#E0A400] bg-clip-text text-transparent">
            {year}
          </span>
        </p>
        {r.stage && <p className="text-[15px] font-medium text-white/70">{stageText(r.stage)}</p>}
      </div>

      {/* ── The figure, with what is left and what comes next beside it ─── */}
      <div className="mt-7 flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="shrink-0">
          {r.started ? (
            <>
              <p aria-hidden className="flex items-end font-semibold leading-none tabular-nums">
                <Roll value={whole} className={FIGURE} />
                <span className={`mb-[0.19em] ml-1 flex ${FIGURE_SMALL}`}>
                  <Roll value={`.${decimals}`} className="text-[#FFCD00]" />
                  <Roll value="%" className="ml-1 text-white/40" />
                </span>
              </p>
              <p className="mt-3 text-[15px] text-white/60">of the quarter has gone by</p>
            </>
          ) : (
            <>
              <p aria-hidden className="flex items-end font-semibold leading-none tabular-nums">
                <Roll value={String(daysToStart)} className={FIGURE} />
                <span className={`mb-[0.19em] ml-2 text-white/40 ${FIGURE_SMALL}`}>{daysToStart === 1 ? "day" : "days"}</span>
              </p>
              <p className="mt-3 text-[15px] text-white/60">
                until the quarter begins, {dayLabel(r.quarter.begins)}
              </p>
            </>
          )}
          <p className="sr-only">
            {r.started
              ? `${(r.fraction * 100).toFixed(1)}% of ${r.quarter.name} has gone by; ${toGo(r.remaining)} to go.`
              : `${r.quarter.name} begins ${dayLabel(r.quarter.begins)}, in ${daysToStart} ${daysToStart === 1 ? "day" : "days"}.`}
          </p>
        </div>

        {facts.length > 0 && (
          <dl className="grid min-w-0 grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-1 sm:text-right">
            {facts.map((f) => <Fact key={f.label} {...f} />)}
          </dl>
        )}
      </div>

      {/* ── The quarter as a bar ─────────────────────────────────────────── */}
      <div className="relative mt-12">
        {/* The calendar's named days, above the bar: hover or focus one for its date. */}
        <div className="pointer-events-none absolute inset-x-0 -top-7 h-6">
          {markers.map((m) => (
            <Marker key={`${m.kind}-${m.from}`} m={m} left={(at(m.from) + at(nextDayOf(m.to))) / 2} upcoming={r.next === m} />
          ))}
        </div>

        <div className="relative h-2 rounded-full bg-white/10">
          {finals && (
            <div
              title={`${finals.label}, ${dayLabel(finals.from)} – ${dayLabel(finals.to)}`}
              className="absolute inset-y-0 right-0 rounded-r-full bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.16)_0_2px,transparent_2px_6px)]"
              style={{ left: `${at(finals.from)}%` }}
            />
          )}
          <div
            className="absolute inset-y-0 left-0 overflow-hidden rounded-full bg-[linear-gradient(90deg,#8a6800,#FFCD00_55%,#FFF0B0)] shadow-[0_0_16px_rgba(255,205,0,0.5)] transition-[width] duration-1000 ease-out motion-reduce:transition-none"
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
              <span className="absolute inset-0 animate-ping rounded-full bg-[#FFCD00]/45 motion-reduce:hidden" />
              <span className="relative block h-4 w-4 rounded-full bg-white shadow-[0_0_0_3px_rgba(255,205,0,0.35),0_0_20px_6px_rgba(255,205,0,0.45)]" />
            </span>
          )}
        </div>

        <div className="mt-3 flex justify-between gap-4 text-xs text-white/45">
          <span>{r.started ? "Began" : "Begins"} {dayLabel(r.quarter.begins)}</span>
          <span>Ends {dayLabel(r.quarter.end)}</span>
        </div>
      </div>

      <a
        href={calendarUrl(r.quarter.key)}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-7 flex w-fit items-center gap-1 text-xs text-white/40 transition hover:text-white"
      >
        Dates: UCSD Academic Calendar <ArrowUpRight className="h-3 w-3" />
      </a>
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

/** A named day on the bar: a small dot, gold when it is the next one. The button around it is a 24px target. */
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
          <span
            className={`block rounded-full transition ${
              upcoming
                ? "h-2 w-2 bg-[#FFCD00] shadow-[0_0_10px_2px_rgba(255,205,0,0.6)]"
                : "h-1.5 w-1.5 bg-white/55 group-hover:bg-white"
            }`}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        <span className="font-semibold">{m.label}</span> · {when}
      </TooltipContent>
    </Tooltip>
  );
}

interface FactProps {
  label: string;
  value: string;
  sub?: string;
  /** Gold, to match the gold marker on the bar it describes. */
  accent?: boolean;
}

/** One fact beside the figure: a small label, its value, and a line of detail if it needs one. */
function Fact({ label, value, sub, accent = false }: FactProps) {
  return (
    <div className="min-w-0">
      <dt className={`text-xs font-medium ${accent ? "text-[#FFCD00]" : "text-white/50"}`}>{label}</dt>
      <dd className="mt-1.5 text-lg font-semibold leading-snug tracking-tight">{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-white/50">{sub}</dd>}
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

/** "Week 2 of 10", or where the quarter is when it is outside the numbered weeks. */
function stageText(s: NonNullable<ClockReading["stage"]>): string {
  if (s.kind === "before-instruction") return "Before instruction";
  if (s.kind === "finals") return "Finals week";
  return `Week ${s.week} of ${s.of}`;
}

/** The time left in the unit it is best read in: "64 days", and on the last day "5 hours". */
function toGo(ms: number): string {
  const d = splitDuration(ms);
  if (d.days) return `${d.days} ${d.days === 1 ? "day" : "days"}`;
  if (d.hours) return `${d.hours} ${d.hours === 1 ? "hour" : "hours"}`;
  return d.minutes ? `${d.minutes} min` : "Under a minute";
}

/**
 * "Up next" Veterans Day Holiday, "Wed, Nov 11" — or, for the one under way,
 * "Now". Just the date: "To go" is already the card's countdown.
 */
function upNext(m: Milestone, today: string): { label: string; value: string; sub: string } {
  const range = m.to !== m.from;
  if (m.from <= today) return { label: "Now", value: m.label, sub: range ? `through ${dayLabel(m.to)}` : "today" };
  return { label: "Up next", value: m.label, sub: range ? `${dayLabel(m.from)} – ${dayLabel(m.to)}` : dayLabel(m.from) };
}

/**
 * Before a quarter begins, the days worth planning a break around: when
 * teaching starts, if it does not start with the quarter, and the finals.
 */
function beforeItBegins(all: Milestone[]): FactProps[] {
  const out: FactProps[] = [];
  const instruction = all.find((m) => m.kind === "instruction");
  if (instruction) out.push({ label: "Instruction begins", value: dayLabel(instruction.from) });
  const finals = all.find((m) => m.kind === "finals");
  if (finals) out.push({ label: "Final exams", value: `${dayLabel(finals.from)} – ${dayLabel(finals.to)}` });
  return out;
}

/** The date after `iso`, for centring a marker on a run of days. */
function nextDayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** The live card's outline, block for block, so nothing moves when the time arrives. */
function Placeholder({ className }: { className: string }) {
  return (
    <section aria-label="Quarter clock" className={`${FRAME} ${className}`}>
      <Backdrop />
      <div className="h-[30px] w-36 animate-pulse rounded-lg bg-white/10 sm:h-[35px]" />
      <div className="mt-7 flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="h-[76px] w-56 animate-pulse rounded-2xl bg-white/10 sm:h-[96px] sm:w-72" />
          <div className="mt-3 h-[22px] w-48 animate-pulse rounded-md bg-white/[0.06]" />
        </div>
        <div className="h-[90px] animate-pulse rounded-xl bg-white/[0.06] sm:h-[131px] sm:w-44" />
      </div>
      <div className="mt-12 h-2 animate-pulse rounded-full bg-white/10" />
      <div className="mt-3 h-4" />
      <div className="mt-7 h-4" />
    </section>
  );
}

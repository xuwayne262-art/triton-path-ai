"use client";

import Link from "next/link";
import { CalendarPlus, ExternalLink, House, TramFront } from "lucide-react";
import { SECTION_TITLE } from "@/components/plat/typeScale";
import { DETOUR, WALK_M_PER_MIN, formatDistance, type LatLng } from "@/lib/campus";
import {
  LIBRARY_WALK, MODES, clockLabel, formatDuration, formatHours, perQuarter, transitUrl, type Mode,
} from "@/lib/housing/commute";
import { QUARTER_WEEKS } from "@/lib/housing/terms";
import type { TermSchedule } from "./useTermSchedule";
import { ModeIcon, ModeToggle, toneFor, type Measure } from "./parts";

/**
 * "Your week from here" — the part of a listing no other housing site can
 * show: each day, when to leave for the first class and how long the trip is,
 * and how long the way home from the last one takes.
 */
export default function CommuteWeek({
  home, measure, mode, onMode, schedule,
}: {
  home: LatLng;
  measure: Measure;
  mode: Mode;
  onMode: (m: Mode) => void;
  schedule: TermSchedule;
}) {
  // One transit link per building: a Tuesday/Thursday lecture in the same hall is the same trip.
  const transitDays = new Set(
    measure.kind === "week"
      ? measure.week.days
          .filter((d, i, all) => all.findIndex((x) => x.first.event.buildingCode === d.first.event.buildingCode) === i)
          .map((d) => d.day)
      : [],
  );

  return (
    <section aria-labelledby="commute-h" className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="commute-h" className={SECTION_TITLE}>Your week from here</h2>
        <ModeToggle mode={mode} onMode={onMode} />
      </div>

      {measure.kind === "week" ? (
        <>
          <p className={`mt-3 text-2xl font-black tracking-tight ${toneFor(measure.oneWay)}`}>
            {formatDuration(measure.week.minutes)}
            <span className="ml-1.5 text-sm font-semibold text-gray-500 dark:text-gray-400">a week {MODES[mode].verb}</span>
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            About {formatHours(perQuarter(measure.week))} over a {QUARTER_WEEKS}-week quarter — one round trip a
            day, to your {schedule.termName} classes.
          </p>

          <ol className="mt-4 space-y-2">
            {measure.week.days.map((d) => (
              <li key={d.day} className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-white/5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-bold">{d.day}</span>
                  <span className="text-xs font-semibold tabular-nums">
                    leave by <span className="text-[#182B49] dark:text-[#FFCD00]">{clockLabel(d.leaveBy)}</span>
                  </span>
                </div>
                <p className="mt-1 flex items-start gap-1.5 text-[12px] text-gray-700 dark:text-gray-200">
                  <ModeIcon mode={mode} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span>
                    <b className="tabular-nums">{d.there.minutes} min</b> ({formatDistance(d.there.meters)}) to{" "}
                    <b>{d.first.event.code}</b> {d.first.event.kindLabel.toLowerCase()} at {clockLabel(d.first.event.startMin)},{" "}
                    {d.first.building.n}
                  </span>
                </p>
                <p className="mt-0.5 flex items-start gap-1.5 text-[12px] text-gray-500 dark:text-gray-400">
                  <House className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span>
                    <span className="tabular-nums">{d.back.minutes} min</span> home after {d.last.event.code} ends{" "}
                    {clockLabel(d.last.event.endMin)} in {d.last.building.n}
                  </span>
                </p>
                {d.unplaced.length > 0 && (
                  <p className="mt-0.5 pl-5 text-[11px] text-gray-400">
                    Also {d.unplaced.map((e) => e.code).join(", ")} — no room on the map yet.
                  </p>
                )}
                {transitDays.has(d.day) && (
                  <a
                    href={transitUrl(home, d.first.building.ll)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 inline-flex items-center gap-1 pl-5 text-[11px] font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]"
                  >
                    <TramFront className="h-3 w-3" /> Bus &amp; trolley to {d.first.building.n} in Google Maps <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </li>
            ))}
          </ol>
          {measure.week.unmapped.length > 0 && (
            <p className="mt-2 text-[11px] text-gray-400">
              {measure.week.unmapped.join(", ")}: your classes those days have no room on the map yet.
            </p>
          )}
        </>
      ) : (
        <>
          <p className={`mt-3 text-2xl font-black tracking-tight ${toneFor(measure.oneWay)}`}>
            {measure.trip.minutes} min
            <span className="ml-1.5 text-sm font-semibold text-gray-500 dark:text-gray-400">
              to Library Walk {MODES[mode].verb}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{formatDistance(measure.trip.meters)} each way.</p>
          <div className="mt-4 rounded-xl border border-dashed border-[#182B49]/30 bg-[#182B49]/[0.03] p-3 dark:border-[#FFCD00]/30 dark:bg-[#FFCD00]/[0.04]">
            <p className="flex items-center gap-1.5 text-xs font-bold">
              <CalendarPlus className="h-4 w-4 text-[#182B49] dark:text-[#FFCD00]" />
              See it against your own week
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-600 dark:text-gray-300">
              {schedule.undecided.length
                ? `Pick sections for ${schedule.undecided.join(", ")} in the planner, and this shows when you would leave each morning and how long every trip takes.`
                : "Add your classes in the planner, and this shows when you would leave each morning, to which building, and how long every trip takes."}
            </p>
            <Link href="/planner" className="mt-2 inline-flex text-[11px] font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]">
              Open the planner →
            </Link>
          </div>
          <a
            href={transitUrl(home, LIBRARY_WALK)}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[#182B49] hover:underline dark:text-[#FFCD00]"
          >
            <TramFront className="h-3 w-3" /> Bus &amp; trolley times in Google Maps <ExternalLink className="h-3 w-3" />
          </a>
        </>
      )}

      <p className="mt-4 border-t border-gray-100 pt-3 text-[10px] leading-snug text-gray-400 dark:border-white/5">
        Estimates: straight-line distance × {DETOUR}, walked at {WALK_M_PER_MIN} m a minute (the pace of
        UCSD&rsquo;s own campus routes) or cycled at {MODES.bike.mPerMin} (15 km/h). Hills, traffic lights and
        the bike rack are not in it; bus and trolley times are one click away in Google Maps.
      </p>
    </section>
  );
}

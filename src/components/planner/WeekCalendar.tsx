"use client";

import { CalendarDays, X } from "lucide-react";
import { DAYS } from "@/components/triton/types";
import { ROLE_STYLES } from "@/lib/plannerBridge";
import {
  dayWindow, layoutDay, minutesToLabel, type CalEvent, type PlacedEvent,
} from "@/lib/sections";

/**
 * The week.
 *
 * Two things the old grid got wrong and this fixes. It ran a fixed 8am–10pm no
 * matter what, spending most of its height on hours nobody had class in; the
 * window now snaps to the hours actually in use. And overlapping blocks were
 * both drawn full-width, so a clash — the one thing the calendar exists to
 * reveal — hid underneath whichever block painted last. Overlaps now sit
 * side by side.
 */

/** An hour of wall time, in pixels. Tuned so a 50-minute section stays legible. */
const PX_PER_HOUR = 56;
const pxPerMin = PX_PER_HOUR / 60;

const isLectureKind = (kind: string) => kind === "LE" || kind === "SE";

function Block({
  event, windowStart, darkMode, onRemove,
}: {
  event: PlacedEvent;
  windowStart: number;
  darkMode: boolean;
  onRemove?: (code: string) => void;
}) {
  const style = ROLE_STYLES[event.role];
  const top = (event.startMin - windowStart) * pxPerMin;
  const height = (event.endMin - event.startMin) * pxPerMin;
  const width = 100 / event.lanes;

  // Lectures read as the solid commitment; discussions and labs hang off them,
  // so they are drawn lighter with a dashed edge rather than in a second colour
  // the legend would then have to explain.
  const lecture = isLectureKind(event.kind);

  return (
    <div
      className={`group absolute overflow-hidden rounded-md px-1.5 py-1 ${
        lecture ? style.bg : darkMode ? "bg-white/[0.07]" : "bg-white"
      } ${event.conflict ? "ring-2 ring-red-500" : ""}`}
      style={{
        top: `${top}px`,
        height: `${Math.max(height, 20)}px`,
        left: `calc(${event.lane * width}% + 2px)`,
        width: `calc(${width}% - 4px)`,
        borderLeft: `3px ${lecture ? "solid" : "dashed"} ${style.hex}`,
      }}
      title={[
        `${event.code} — ${event.title}`,
        event.sectionCode ? `${event.kindLabel} ${event.sectionCode}` : event.kindLabel,
        `${minutesToLabel(event.startMin)} – ${minutesToLabel(event.endMin)}`,
        event.where,
        event.instructor,
        event.conflict ? "Conflicts with another course" : "",
      ].filter(Boolean).join("\n")}
    >
      <p className={`truncate text-[11px] font-bold leading-tight ${lecture ? style.text : ""}`}>
        {event.code}
      </p>
      {height >= 34 && (
        <p className="truncate text-[10px] leading-tight text-gray-500 dark:text-gray-400">
          {event.sectionCode ? `${event.kindLabel} ${event.sectionCode}` : event.kindLabel}
        </p>
      )}
      {height >= 52 && event.where && (
        <p className="truncate text-[10px] leading-tight text-gray-400">{event.where}</p>
      )}

      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(event.code)}
          aria-label={`Remove ${event.code} from the schedule`}
          className="absolute right-0.5 top-0.5 rounded bg-white/80 p-0.5 text-gray-600 opacity-0 transition hover:bg-white hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 dark:bg-gray-900/80 dark:text-gray-300"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}

export default function WeekCalendar({
  events,
  darkMode,
  onRemove,
}: {
  events: CalEvent[];
  darkMode: boolean;
  onRemove?: (code: string) => void;
}) {
  const { startMin, endMin } = dayWindow(events);
  const hours: number[] = [];
  for (let m = startMin; m < endMin; m += 60) hours.push(m);
  const bodyHeight = hours.length * PX_PER_HOUR;

  if (!events.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center dark:border-white/15">
        <CalendarDays className="mb-3 h-10 w-10 text-gray-300 dark:text-white/20" />
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          Your week will appear here
        </p>
        <p className="mt-1 max-w-xs text-xs text-gray-500 dark:text-gray-400">
          Add a course from the left, then pick its sections — lectures and discussions
          both land on this calendar, and anything that collides is flagged.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-xl border ${
        darkMode ? "border-white/10 bg-gray-800" : "border-slate-200 bg-white"
      }`}
    >
      {/* Day header */}
      <div
        className={`grid border-b ${
          darkMode ? "border-white/10 bg-gray-700/50" : "border-slate-200 bg-slate-50"
        }`}
        style={{ gridTemplateColumns: "52px repeat(5, minmax(0, 1fr))" }}
      >
        <div />
        {DAYS.map((day) => (
          <div
            key={day}
            className={`py-2 text-center text-xs font-semibold ${
              darkMode ? "text-gray-300" : "text-slate-600"
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Grid body */}
      <div className="grid" style={{ gridTemplateColumns: "52px repeat(5, minmax(0, 1fr))" }}>
        {/* Hour gutter */}
        <div className={`border-r ${darkMode ? "border-white/10" : "border-slate-200"}`}>
          {hours.map((m) => (
            <div
              key={m}
              className={`flex items-start justify-end pr-1.5 pt-0.5 text-[10px] tabular-nums ${
                darkMode ? "text-gray-500" : "text-slate-400"
              }`}
              style={{ height: `${PX_PER_HOUR}px` }}
            >
              {minutesToLabel(m)}
            </div>
          ))}
        </div>

        {DAYS.map((day, dayIdx) => {
          const placed = layoutDay(events.filter((e) => e.day === day));
          return (
            <div
              key={day}
              className={`relative ${
                dayIdx < DAYS.length - 1
                  ? darkMode ? "border-r border-white/10" : "border-r border-slate-200"
                  : ""
              }`}
              style={{ height: `${bodyHeight}px` }}
            >
              {hours.map((m) => (
                <div
                  key={m}
                  className={`border-b ${darkMode ? "border-white/[0.07]" : "border-slate-100"}`}
                  style={{ height: `${PX_PER_HOUR}px` }}
                />
              ))}

              {placed.map((event) => (
                <Block
                  key={event.key}
                  event={event}
                  windowStart={startMin}
                  darkMode={darkMode}
                  onRemove={onRemove}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

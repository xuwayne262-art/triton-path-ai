"use client";

import { CalendarDays, Footprints, X } from "lucide-react";
import { DAYS } from "@/components/triton/types";
import { ROLE_STYLES } from "@/lib/plannerBridge";
import { formatDistance, type Leg } from "@/lib/campus";
import {
  dayWindow, layoutDay, minutesToLabel, type CalEvent, type PlacedEvent,
} from "@/lib/sections";

/**
 * The week.
 *
 * Overlapping blocks sit side by side rather than hiding one another, and the
 * window grows only for an early lab or an evening lecture. On top of the
 * committed week it now draws what is still open: a course with a lecture to
 * choose shows each lecture as a dashed block you can click, a focused course
 * shows every alternative the same way, and whatever option the student is
 * hovering in the rail is outlined where it would land. Between two classes
 * too far apart for their break, it says so where it happens.
 */

/** An hour of wall time, in pixels. Tuned so a 50-minute section stays legible. */
const PX_PER_HOUR = 56;
const pxPerMin = PX_PER_HOUR / 60;

const isLectureKind = (kind: string) => kind === "LE" || kind === "SE";

export interface Highlight {
  code?: string | null;
  building?: string | null;
}

function geometry(event: PlacedEvent, windowStart: number) {
  const top = (event.startMin - windowStart) * pxPerMin;
  const height = Math.max((event.endMin - event.startMin) * pxPerMin, 20);
  const width = 100 / event.lanes;
  return {
    top: `${top}px`,
    height: `${height}px`,
    left: `calc(${event.lane * width}% + 2px)`,
    width: `calc(${width}% - 4px)`,
    px: height,
  };
}

function Block({
  event, windowStart, darkMode, lit, dim, focused, onRemove, onHover, onPick,
}: {
  event: PlacedEvent;
  windowStart: number;
  darkMode: boolean;
  lit: boolean;
  dim: boolean;
  focused: boolean;
  onRemove?: (code: string) => void;
  onHover?: (e: CalEvent | null) => void;
  onPick?: (e: CalEvent) => void;
}) {
  const style = ROLE_STYLES[event.role];
  const g = geometry(event, windowStart);
  // Lectures read as the solid commitment; discussions and labs hang off them,
  // so they are drawn lighter with a dashed edge rather than in a second colour
  // the legend would then have to explain.
  const lecture = isLectureKind(event.kind);

  return (
    <div
      onMouseEnter={() => onHover?.(event)}
      onMouseLeave={() => onHover?.(null)}
      onClick={() => onPick?.(event)}
      className={`group absolute cursor-pointer overflow-hidden rounded-md px-1.5 py-1 transition-[opacity,box-shadow] duration-150 ${
        lecture ? style.bg : darkMode ? "bg-white/[0.07]" : "bg-white"
      } ${event.conflict ? "ring-2 ring-red-500" : ""} ${
        lit ? "z-10 shadow-lg ring-2 ring-[#FFCD00]" : focused ? "ring-2 ring-[#182B49]/50 dark:ring-[#FFCD00]/60" : ""
      } ${dim ? "opacity-50" : ""}`}
      style={{
        top: g.top,
        height: g.height,
        left: g.left,
        width: g.width,
        borderLeft: `3px ${lecture ? "solid" : "dashed"} ${style.hex}`,
      }}
      title={[
        `${event.code} — ${event.title}`,
        event.sectionCode ? `${event.kindLabel} ${event.sectionCode}` : event.kindLabel,
        `${minutesToLabel(event.startMin)} – ${minutesToLabel(event.endMin)}`,
        [event.where, event.building && event.building !== event.where ? event.building : ""].filter(Boolean).join(", "),
        event.instructor,
        event.conflict ? "Conflicts with another course" : "",
      ].filter(Boolean).join("\n")}
    >
      <p className={`truncate text-[11px] font-bold leading-tight ${lecture ? style.text : ""}`}>
        {event.code}
      </p>
      {g.px >= 34 && (
        <p className="truncate text-[10px] leading-tight text-gray-500 dark:text-gray-400">
          {event.sectionCode ? `${event.kindLabel} ${event.sectionCode}` : event.kindLabel}
        </p>
      )}
      {g.px >= 48 && event.where && (
        <p className="truncate text-[10px] font-medium leading-tight text-gray-500 dark:text-gray-400">
          {event.where}
        </p>
      )}

      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(event.code); }}
          aria-label={`Remove ${event.code} from the schedule`}
          className="absolute right-0.5 top-0.5 rounded bg-white/80 p-0.5 text-gray-600 opacity-0 transition hover:bg-white hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 dark:bg-gray-900/80 dark:text-gray-300"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}

/** An open choice, drawn where it would land and chosen by clicking it. */
function OptionBlock({
  event, windowStart, onChoose, onHover,
}: {
  event: PlacedEvent;
  windowStart: number;
  onChoose?: (e: CalEvent) => void;
  onHover?: (e: CalEvent | null) => void;
}) {
  const style = ROLE_STYLES[event.role];
  const g = geometry(event, windowStart);
  return (
    <button
      type="button"
      onClick={() => onChoose?.(event)}
      onMouseEnter={() => onHover?.(event)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(event)}
      onBlur={() => onHover?.(null)}
      aria-label={`Choose ${event.kindLabel} ${event.sectionCode ?? ""} for ${event.code}, ${event.day} ${minutesToLabel(event.startMin)}`}
      className="group absolute overflow-hidden rounded-md border border-dashed px-1.5 py-1 text-left opacity-80 transition hover:z-20 hover:opacity-100 hover:shadow-lg focus-visible:z-20 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCD00]"
      style={{
        top: g.top,
        height: g.height,
        left: g.left,
        width: g.width,
        borderColor: style.hex,
        background: `repeating-linear-gradient(135deg, ${style.hex}1f 0 6px, transparent 6px 12px)`,
      }}
    >
      <p className="truncate text-[11px] font-bold leading-tight">{event.code}</p>
      {g.px >= 34 && (
        <p className="truncate text-[10px] leading-tight text-gray-600 dark:text-gray-300">
          {event.kindLabel} {event.sectionCode}
        </p>
      )}
      {g.px >= 48 && (
        <p className="truncate text-[10px] font-semibold leading-tight text-[#182B49] group-hover:underline dark:text-[#FFCD00]">
          Choose
        </p>
      )}
    </button>
  );
}

/** The option being hovered in the rail, outlined where it would land. */
function PreviewBlock({ event, windowStart }: { event: CalEvent; windowStart: number }) {
  const style = ROLE_STYLES[event.role];
  const top = (event.startMin - windowStart) * pxPerMin;
  const height = Math.max((event.endMin - event.startMin) * pxPerMin, 20);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0.5 z-30 rounded-md border-2 border-dashed px-1.5 py-1 shadow-lg backdrop-blur-[1px]"
      style={{ top: `${top}px`, height: `${height}px`, borderColor: style.hex, background: `${style.hex}2e` }}
    >
      <p className="truncate text-[11px] font-bold leading-tight">{event.code}</p>
      {height >= 34 && (
        <p className="truncate text-[10px] font-semibold leading-tight">
          {event.kindLabel} {event.sectionCode} · {event.where || "Room TBA"}
        </p>
      )}
    </div>
  );
}

/** A leg the student cannot comfortably make, pinned where the break is. */
function WalkAlert({ leg, windowStart }: { leg: Leg; windowStart: number }) {
  const late = leg.status === "late";
  const top = (leg.from.event.endMin - windowStart) * pxPerMin;
  const walk = leg.walk;
  if (!walk) return null;
  const why = late
    ? `about ${walk.minutes - leg.gap} min late`
    : `only ${leg.gap - walk.minutes} min to spare`;
  return (
    <div
      className={`absolute right-1 z-20 flex -translate-y-1/2 items-center gap-0.5 rounded-full px-1.5 py-px text-[9px] font-bold text-white shadow ${
        late ? "bg-red-500" : "bg-amber-500"
      }`}
      style={{ top: `${top + Math.max(leg.gap, 0) * pxPerMin / 2}px` }}
      title={`${walk.minutes}-minute walk (${formatDistance(walk.meters)}) from ${
        leg.from.event.where || leg.from.event.code
      } to ${leg.to.event.where || leg.to.event.code} with a ${leg.gap}-minute break — ${why}.${
        leg.source === "estimate" ? " Estimated from the straight-line distance." : " Route by UCSD's Class Planner."
      }`}
    >
      <Footprints className="h-2.5 w-2.5" />
      {walk.minutes}m
    </div>
  );
}

export default function WeekCalendar({
  events,
  ghosts = [],
  darkMode,
  highlight = null,
  focusCode = null,
  troubles = [],
  onRemove,
  onHover,
  onPick,
  onChoose,
}: {
  events: CalEvent[];
  /** Options and previews — blocks that are not commitments. */
  ghosts?: CalEvent[];
  darkMode: boolean;
  /** A course or building to pick out, from the rail or the map. */
  highlight?: Highlight | null;
  focusCode?: string | null;
  /** Late and tight connections, to flag between the two blocks. */
  troubles?: Leg[];
  onRemove?: (code: string) => void;
  onHover?: (e: CalEvent | null) => void;
  onPick?: (e: CalEvent) => void;
  onChoose?: (e: CalEvent) => void;
}) {
  const options = ghosts.filter((g) => g.ghost === "option");
  const previews = ghosts.filter((g) => g.ghost === "preview");
  const { startMin, endMin } = dayWindow([...events, ...ghosts]);
  const hours: number[] = [];
  for (let m = startMin; m < endMin; m += 60) hours.push(m);
  const bodyHeight = hours.length * PX_PER_HOUR;

  // A course, when one is named, outranks a building: hovering a block lights
  // its course here and its building on the map, not every class next door.
  const active = Boolean(highlight?.code || highlight?.building);
  const isLit = (e: CalEvent) =>
    highlight?.code
      ? e.code === highlight.code
      : Boolean(highlight?.building && e.buildingCode === highlight.building);

  if (!events.length && !ghosts.length) {
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
          // Options share lanes with real blocks, so an option that would clash
          // sits visibly beside what it clashes with instead of underneath it.
          const placed = layoutDay([...events, ...options].filter((e) => e.day === day));
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

              {placed.map((event) =>
                event.ghost === "option" ? (
                  <OptionBlock
                    key={event.key}
                    event={event}
                    windowStart={startMin}
                    onChoose={onChoose}
                    onHover={onHover}
                  />
                ) : (
                  <Block
                    key={event.key}
                    event={event}
                    windowStart={startMin}
                    darkMode={darkMode}
                    lit={isLit(event)}
                    dim={active && !isLit(event)}
                    focused={focusCode === event.code}
                    onRemove={onRemove}
                    onHover={onHover}
                    onPick={onPick}
                  />
                ),
              )}

              {previews
                .filter((p) => p.day === day)
                .map((p) => <PreviewBlock key={p.key} event={p} windowStart={startMin} />)}

              {troubles
                .filter((l) => l.from.event.day === day)
                .map((l) => (
                  <WalkAlert key={`${l.from.event.key}>${l.to.event.key}`} leg={l} windowStart={startMin} />
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

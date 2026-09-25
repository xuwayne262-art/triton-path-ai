"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowDown, ExternalLink, Footprints, Loader2, LocateFixed, MapPin, MapPinOff, Route, X,
} from "lucide-react";
import type { DayOfWeek } from "@/components/triton/types";
import type { Building } from "@/lib/plat";
import { ROLE_STYLES } from "@/lib/plannerBridge";
import {
  WEEKDAYS, directionsUrl, formatDistance, pinsFor, previewWalks, troubleLegs, weeklyWalking,
  type DayPlan, type Leg, type LegStatus,
} from "@/lib/campus";
import { compactRange, minutesToLabel, type CalEvent } from "@/lib/sections";
import type { MapPin as MapPinData } from "./CampusMap";
import type { RouteSource } from "./useWalkRoutes";

/**
 * "Where do I go?" — the pull-out on the right of the calendar.
 *
 * TritonPlan and UCSD's own Class Planner both put the map on a separate tab,
 * so you can look at your week or at the campus, never both. Here it sits
 * beside the calendar and follows it: hover a class and its building lights
 * up, hover an option in the rail and the map shows where it would send you,
 * and pick a day to walk it stop by stop, with every connection too tight for
 * its break called out.
 */

const CampusMap = dynamic(() => import("./CampusMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-2 bg-slate-100 text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading the campus…
    </div>
  ),
});

export type MapDay = "week" | DayOfWeek;

/** The week view walks nowhere; one shared empty list keeps the map from redrawing. */
const NO_LEGS: Leg[] = [];

const DAY_SHORT: Record<DayOfWeek, string> = { Mon: "M", Tue: "Tu", Wed: "W", Thu: "Th", Fri: "F" };

const LEG_TONE: Record<LegStatus, string> = {
  ok: "text-gray-500 dark:text-gray-400",
  same: "text-gray-400",
  tight: "text-amber-600 dark:text-amber-400",
  late: "text-red-600 dark:text-red-400",
  clash: "text-red-600 dark:text-red-400",
  unknown: "text-gray-400",
};

const roleHex = (e: CalEvent) => ROLE_STYLES[e.role].hex;

function legLine(l: Leg): string {
  if (l.status === "clash") return "These two overlap — there is no break to walk in";
  if (l.status === "same") return `Same building · ${l.gap} min break`;
  if (!l.walk) return `${l.gap} min break · walk unknown (no room yet)`;
  const base = `${l.walk.minutes} min walk · ${formatDistance(l.walk.meters)} · ${l.gap} min break`;
  if (l.status === "late") return `${base} — about ${l.walk.minutes - l.gap} min late`;
  if (l.status === "tight") return `${base} — tight`;
  return base;
}

/** One class in the list: when, what, and the door to find. */
function StopRow({
  n, event, building, hot, onHot, onSelect,
}: {
  n?: number;
  event: CalEvent;
  building: Building | null;
  hot: boolean;
  onHot: (on: boolean) => void;
  onSelect: () => void;
}) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg px-2 py-1.5 transition ${
        hot ? "bg-[#FFCD00]/15" : "hover:bg-slate-50 dark:hover:bg-white/5"
      }`}
      onMouseEnter={() => onHot(true)}
      onMouseLeave={() => onHot(false)}
    >
      {n != null ? (
        <span
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ background: roleHex(event) }}
        >
          {n}
        </span>
      ) : (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: roleHex(event) }} />
      )}
      <button type="button" onClick={onSelect} disabled={!building} className="min-w-0 flex-1 text-left disabled:cursor-default">
        <p className="flex items-baseline gap-1.5 text-[12px]">
          <span className="shrink-0 font-semibold tabular-nums">{minutesToLabel(event.startMin)}</span>
          <span className="truncate font-bold">{event.code}</span>
          <span className="truncate text-gray-500 dark:text-gray-400">
            {event.kindLabel} {event.sectionCode ?? ""}
          </span>
        </p>
        <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
          {event.where || "Room TBA"}
          {building ? ` · ${building.n}` : event.where ? " · not on the map" : ""}
        </p>
      </button>
      {building && (
        <a
          href={directionsUrl(building.ll)}
          target="_blank"
          rel="noreferrer noopener"
          title={`Walking directions to ${building.n} in Google Maps`}
          aria-label={`Walking directions to ${building.n}`}
          className="mt-0.5 shrink-0 rounded p-1 text-gray-400 transition hover:bg-slate-100 hover:text-[#182B49] dark:hover:bg-white/10 dark:hover:text-[#FFCD00]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

export default function MapPanel({
  darkMode, events, preview, previewLabel, buildings, plans, routeSource,
  day, onDay, hotBuilding, hotCourse, onHotBuilding, onClose,
}: {
  darkMode: boolean;
  /** The committed week. */
  events: CalEvent[];
  /** The option hovered in the rail, as blocks. */
  preview: CalEvent[];
  previewLabel: string | null;
  buildings: Record<string, Building>;
  /** Monday to Friday, each planned with UCSD's routes where it had them. */
  plans: DayPlan[];
  routeSource: RouteSource;
  day: MapDay;
  onDay: (d: MapDay) => void;
  hotBuilding: string | null;
  /** A course hovered in the rail or on the calendar. */
  hotCourse: string | null;
  onHotBuilding: (code: string | null) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [refit, setRefit] = useState(0);

  const plan = day === "week" ? null : plans.find((p) => p.day === day) ?? null;
  const legs = useMemo(() => plan?.legs ?? NO_LEGS, [plan]);
  const shown = useMemo(
    () => (plan ? plan.stops.map((s) => s.event) : events),
    [plan, events],
  );
  const { pins, unplaced } = useMemo(() => pinsFor(shown, buildings), [shown, buildings]);

  const mapPins = useMemo((): MapPinData[] => {
    const committed = pins.map((p) => {
      const colors = [...new Set(p.events.map(roleHex))];
      const badges = plan
        ? plan.stops
            .filter((s) => s.event.buildingCode === p.code)
            .map((s) => ({ label: String(s.n), color: roleHex(s.event) }))
        : [];
      return { ...p, colors, badges };
    });
    const ghosts = pinsFor(preview, buildings).pins.map((p) => ({ ...p, colors: [], badges: [], ghost: true }));
    return [...committed, ...ghosts];
  }, [pins, plan, preview, buildings]);

  const walks = useMemo(() => previewWalks(preview, events, buildings), [preview, events, buildings]);
  const week = useMemo(() => weeklyWalking(plans), [plans]);
  const busyDays = new Set(events.map((e) => e.day));

  // A hovered course lights the first building it meets in on this view.
  const hot = hotBuilding ?? (hotCourse ? shown.find((e) => e.code === hotCourse && e.buildingCode)?.buildingCode ?? null : null);
  const fitKey = `${day}|${pins.map((p) => p.code).sort().join(",")}|${refit}`;

  const selectBuilding = (code: string | null) => setSelected((cur) => (code && cur === code ? null : code));

  return (
    <aside
      aria-label="Campus map"
      className="flex h-full w-full flex-col overflow-hidden border-l border-gray-200 bg-white dark:border-white/10 dark:bg-gray-800"
    >
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-white/10">
        <MapPin className="h-4 w-4 text-[#182B49] dark:text-[#FFCD00]" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold leading-tight">Where your classes meet</h2>
          <p className="text-[10px] leading-tight text-gray-500 dark:text-gray-400">
            {pins.length} {pins.length === 1 ? "building" : "buildings"}
            {day === "week" ? " this week" : ` on ${day}`}
            {week.minutes > 0 && ` · ~${week.minutes} min walking a week`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefit((n) => n + 1)}
          title="Show all my buildings"
          aria-label="Show all my buildings"
          className="rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <LocateFixed className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Close the map"
          aria-label="Close the map"
          className="rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Day tabs ── */}
      <div role="tablist" aria-label="Day" className="flex shrink-0 gap-1 border-b border-gray-200 px-2 py-1.5 dark:border-white/10">
        {(["week", ...WEEKDAYS] as MapDay[]).map((d) => {
          const active = d === day;
          const plan = d === "week" ? null : plans.find((p) => p.day === d);
          const trouble = plan ? troubleLegs(plan) : [];
          const late = trouble.some((l) => l.status === "late" || l.status === "clash");
          const empty = d !== "week" && !busyDays.has(d);
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onDay(d)}
              title={
                trouble.length
                  ? `${trouble.length} ${trouble.length === 1 ? "connection" : "connections"} to check`
                  : empty ? "No classes" : undefined
              }
              className={`relative flex-1 rounded-md py-1 text-[11px] font-semibold transition ${
                active
                  ? "bg-[#182B49] text-white dark:bg-[#FFCD00] dark:text-[#182B49]"
                  : empty
                    ? "text-gray-300 hover:bg-gray-50 dark:text-gray-600 dark:hover:bg-white/5"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
              }`}
            >
              {d === "week" ? "Week" : DAY_SHORT[d]}
              {trouble.length > 0 && (
                <span
                  aria-hidden
                  className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${late ? "bg-red-500" : "bg-amber-500"}`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Map ── */}
      <div className="relative h-[46%] min-h-[220px] shrink-0">
        <CampusMap
          darkMode={darkMode}
          pins={mapPins}
          legs={legs}
          hot={hot}
          selected={selected}
          fitKey={fitKey}
          onHover={onHotBuilding}
          onSelect={selectBuilding}
        />
        {plan && plan.legs.some((l) => l.walk && l.status !== "same") && (
          <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-gray-600 shadow-sm backdrop-blur dark:bg-gray-900/85 dark:text-gray-300">
            {routeSource === "loading" ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Asking UCSD for routes…</>
            ) : routeSource === "ucsd" ? (
              <><Route className="h-3 w-3" /> Walkways routed by UCSD</>
            ) : (
              <><Route className="h-3 w-3" /> Straight-line estimates</>
            )}
          </span>
        )}
      </div>

      {/* ── What the map shows, in words ── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {preview.length > 0 && previewLabel && (
          <div className="mb-2 rounded-lg border border-dashed border-[#FFCD00] bg-[#FFCD00]/10 px-2.5 py-2">
            <p className="text-[11px] font-bold">Previewing {previewLabel}</p>
            {walks.map((w, i) => {
              const o = preview[i];
              return (
                <p key={o.key} className="mt-0.5 text-[11px] text-gray-600 dark:text-gray-300">
                  <span className="font-semibold">{o.day}</span> {compactRange(clock(o.startMin), clock(o.endMin))}
                  {" · "}{o.where || "Room TBA"}
                  {w.before && (
                    <span className={LEG_TONE[w.before.status]}>
                      {" — "}
                      {w.before.walk
                        ? `${w.before.walk.minutes} min from ${w.before.event.code} (${w.before.gap} min break)`
                        : `after ${w.before.event.code}`}
                    </span>
                  )}
                </p>
              );
            })}
          </div>
        )}

        {!events.length ? (
          <div className="px-3 py-8 text-center">
            <MapPinOff className="mx-auto mb-2 h-6 w-6 text-gray-300 dark:text-white/20" />
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">Nothing to map yet</p>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              Pick sections on the left and every building you need appears here, with the walk between them.
            </p>
          </div>
        ) : plan ? (
          plan.stops.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
              No classes on {plan.day}.
            </p>
          ) : (
            <ol className="m-0 list-none p-0">
              {plan.stops.map((stop, i) => {
                const leg = i > 0 ? plan.legs[i - 1] : null;
                return (
                  <li key={stop.event.key}>
                    {leg && (
                      <p className={`flex items-center gap-1.5 py-0.5 pl-3 text-[10px] font-medium ${LEG_TONE[leg.status]}`}>
                        {leg.status === "same" || !leg.walk ? (
                          <ArrowDown className="h-3 w-3 shrink-0" />
                        ) : (
                          <Footprints className="h-3 w-3 shrink-0" />
                        )}
                        {legLine(leg)}
                        {leg.source === "estimate" && leg.walk && leg.status !== "same" && (
                          <span className="text-gray-400">(est.)</span>
                        )}
                      </p>
                    )}
                    <StopRow
                      n={stop.n}
                      event={stop.event}
                      building={stop.building}
                      hot={hot != null && stop.event.buildingCode === hot}
                      onHot={(on) => onHotBuilding(on ? stop.event.buildingCode || null : null)}
                      onSelect={() => selectBuilding(stop.event.buildingCode || null)}
                    />
                  </li>
                );
              })}
            </ol>
          )
        ) : (
          <ul className="m-0 list-none space-y-1.5 p-0">
            {pins.map((p) => (
              <li
                key={p.code}
                className={`rounded-lg border px-2 py-1.5 transition ${
                  hot === p.code
                    ? "border-[#FFCD00] bg-[#FFCD00]/10"
                    : "border-gray-100 dark:border-white/5"
                }`}
                onMouseEnter={() => onHotBuilding(p.code)}
                onMouseLeave={() => onHotBuilding(null)}
              >
                <div className="flex items-start gap-2">
                  <button type="button" onClick={() => selectBuilding(p.code)} className="min-w-0 flex-1 text-left">
                    <p className="flex items-baseline gap-1.5">
                      <span className="text-[12px] font-bold">{p.code}</span>
                      <span className="truncate text-[11px] text-gray-500 dark:text-gray-400">{p.building.n}</span>
                    </p>
                    {p.building.m && (
                      <p className="truncate text-[10px] text-gray-400">in {p.building.m}</p>
                    )}
                  </button>
                  <a
                    href={directionsUrl(p.building.ll)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-[#182B49] transition hover:bg-slate-100 dark:text-[#FFCD00] dark:hover:bg-white/10"
                  >
                    Directions <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <ul className="mt-1 list-none space-y-0.5 p-0">
                  {dedupeMeetings(p.events).map((m) => (
                    <li key={m.key} className="flex items-center gap-1.5 text-[11px]">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: roleHex(m.event) }} />
                      <span className="font-semibold">{m.event.code}</span>
                      <span className="truncate text-gray-500 dark:text-gray-400">
                        {m.event.kindLabel} {m.event.sectionCode ?? ""} · {m.days} {compactRange(clock(m.event.startMin), clock(m.event.endMin))}
                        {m.event.where && m.event.where !== p.code ? ` · ${m.event.where}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        {unplaced.length > 0 && (
          <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-white/5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Not on the map</p>
            {dedupeMeetings(unplaced).map((m) => (
              <p key={m.key} className="text-[11px] text-gray-600 dark:text-gray-300">
                <span className="font-semibold">{m.event.code}</span> {m.event.kindLabel} {m.event.sectionCode ?? ""}
                {" — "}
                {m.event.where
                  ? `${m.event.where}: UCSD's map has no location for this building`
                  : "room not assigned yet"}
              </p>
            ))}
          </div>
        )}
      </div>

      <p className="shrink-0 border-t border-gray-200 px-3 py-1.5 text-[10px] leading-snug text-gray-400 dark:border-white/10">
        Building locations and walking routes from UCSD&rsquo;s Class Planner. Walking times are
        estimates — leave extra time for elevators, crowds and the first week.
      </p>
    </aside>
  );
}

/** 540 → "9:00a", the spelling compactRange reads. */
function clock(min: number): string {
  const h = Math.floor(min / 60);
  const m = String(min % 60).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${m}${h >= 12 ? "p" : "a"}`;
}

/** Folds a section's MWF blocks into one line: "MWF 9:00–9:50a". */
function dedupeMeetings(events: CalEvent[]): { key: string; event: CalEvent; days: string }[] {
  const byKey = new Map<string, { key: string; event: CalEvent; days: DayOfWeek[] }>();
  for (const e of events) {
    const k = `${e.code}|${e.sectionCode}|${e.startMin}|${e.endMin}|${e.where}`;
    const hit = byKey.get(k);
    if (hit) hit.days.push(e.day);
    else byKey.set(k, { key: k, event: e, days: [e.day] });
  }
  return [...byKey.values()].map((m) => ({
    key: m.key,
    event: m.event,
    days: m.days.map((d) => DAY_SHORT[d]).join(""),
  }));
}

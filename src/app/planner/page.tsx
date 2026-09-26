"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle, CalendarClock, CalendarDays, Footprints, ListChecks, Map as MapIcon, PanelLeftClose,
  PanelLeftOpen, Search, Wand2, X,
} from "lucide-react";
import CourseCatalog from "@/components/triton/CourseCatalog";
import SavedCourses, { ColorLegend } from "@/components/triton/SavedCourses";
import SectionBoard, { type Preview } from "@/components/planner/SectionBoard";
import WeekCalendar, { type Highlight } from "@/components/planner/WeekCalendar";
import MapPanel, { type MapDay } from "@/components/planner/MapPanel";
import ExamList, { type ExamItem } from "@/components/planner/ExamList";
import EventSheet from "@/components/planner/EventSheet";
import { CAN_HOVER, PHONE, useMediaQuery } from "@/components/planner/useMediaQuery";
import { useWalkRoutes } from "@/components/planner/useWalkRoutes";
import { usePref } from "@/components/planner/usePref";
import type { Course, DayOfWeek } from "@/components/triton/types";
import {
  noopSubscribe, passDate, timelineServerSnapshot, timelineSnapshot,
} from "@/lib/plat";
import { WEEKDAYS, planDay, troubleLegs } from "@/lib/campus";
import {
  CODE, eventsForRow, findFamily, groupSections, oneOffsFor, rowsFor, selectedSections,
  type CalEvent,
} from "@/lib/sections";
import { usePlanner } from "./PlannerProvider";

/**
 * The term workspace: sections on the left, the week in the middle, the campus
 * on the right.
 *
 * The left rail follows UCSD's Class Planner in making sections the unit you
 * commit to, and now opens on them: every course arrives with its lectures and
 * discussions laid out to choose from. The calendar keeps what is still open
 * visible as dashed blocks you can click, and the map pulls out from the right
 * edge to show where each class meets and whether you can walk between them.
 *
 * A phone cannot fit three panes side by side — the rail alone is wider than
 * the calendar would be — so below `md` it shows one at a time, switched from
 * a tab bar under the thumb: Courses, Week, Map. Tapping a class on the week
 * opens its details in a sheet, since there is no hover to show them.
 */

type RailTab = "sections" | "browse";

// Per-viewer conveniences, not state anyone else needs.
const TAB_KEY = "ucsdplans-rail-tab";
const MAP_KEY = "ucsdplans-map-open";
const DAY_KEY = "ucsdplans-map-day";
const RAIL_KEY = "ucsdplans-rail-open";
const VIEW_KEY = "ucsdplans-phone-view";

type PhoneView = "courses" | "week" | "map";
const isPhoneView = (v: string): v is PhoneView | "" => v === "courses" || v === "week" || v === "map" || v === "";

const isTab = (v: string): v is RailTab | "" => v === "sections" || v === "browse" || v === "";
const isFlag = (v: string): v is "0" | "1" => v === "0" || v === "1";
const isMapDay = (v: string): v is MapDay => v === "week" || (WEEKDAYS as string[]).includes(v);

/** A short note after something changed, with the one action that follows from it. */
interface Toast {
  text: string;
  action?: { label: string; run: () => void };
}

/** Discussions a course still needs are drawn on the calendar when there are few enough to scan. */
const MAX_PENDING_OPTIONS = 8;

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

/** Enrolment passes: the deadline every one of these decisions is really about. */
function PassStrip() {
  const state = useSyncExternalStore(noopSubscribe, timelineSnapshot, timelineServerSnapshot);
  if (!state) return null;
  const { marks, countdown } = state;

  return (
    <div className="hidden items-center gap-2.5 2xl:flex">
      <span className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
        <CalendarClock className="h-3.5 w-3.5" />
        {countdown ? (
          <>
            <span className="font-bold text-[#182B49] dark:text-[#FFCD00]">
              {countdown.days}d
            </span>
            <span>to {countdown.pass.label}</span>
          </>
        ) : (
          <span>All passes open</span>
        )}
      </span>
      <span aria-hidden className="h-3 w-px bg-gray-200 dark:bg-white/10" />
      <span className="flex items-center gap-2">
        {marks.map(({ pass, done, next }) => (
          <span
            key={pass.label}
            className={`text-[10px] tabular-nums ${
              next
                ? "font-bold text-[#182B49] dark:text-[#FFCD00]"
                : done
                  ? "text-gray-300 line-through dark:text-gray-600"
                  : "text-gray-400"
            }`}
          >
            {pass.label} {passDate(pass)}
          </span>
        ))}
      </span>
    </div>
  );
}

export default function TermWorkspacePage() {
  const {
    darkMode,
    searchQuery, setSearchQuery,
    selectedCourses, addToSchedule, removeFromSchedule, clearSchedule, restoreSchedule,
    sectionsByCode, tssByCode, selections, setSelection, chooseOption, autoPickFor, autoPickAll,
    sectionStatus, events, optionEvents, conflictCodes, totalUnits,
    plannedCourses, addAICourseToPlan, removePlannedCourse,
    platRows, platByCode, savedCourses, toggleSaved, addCourseByCode,
    selectedMajor, selectedMinor, selectedCollege,
    roleOf, getColorForCourse, activeRequirements,
    term, buildings,
  } = usePlanner();

  // ── View state ──────────────────────────────────────────────────────────────
  const [chosenTab, pickTab] = usePref<RailTab | "">(TAB_KEY, "", isTab);
  const [mapFlag, setMapFlag] = usePref<"0" | "1">(MAP_KEY, "0", isFlag);
  const [mapDay, pickDay] = usePref<MapDay>(DAY_KEY, "week", isMapDay);
  const [railFlag, setRailFlag] = usePref<"0" | "1">(RAIL_KEY, "1", isFlag);
  const railOpen = railFlag === "1";
  const mapOpen = mapFlag === "1";
  const isPhone = useMediaQuery(PHONE);
  const canHover = useMediaQuery(CAN_HOVER, true);
  const [chosenView, pickView] = usePref<PhoneView | "">(VIEW_KEY, "", isPhoneView);
  // A phone opens on the week once there is one, and on finding courses before.
  const view: PhoneView = chosenView || (selectedCourses.length ? "week" : "courses");
  /** Whether the map is on screen: the drawer on a desktop, the Map tab on a phone. */
  const mapShown = isPhone ? view === "map" : mapOpen;
  /** A phone's day view: one weekday at full width, or null for the week. */
  const [phoneDay, setPhoneDay] = useState<DayOfWeek | null>(null);
  /** The class tapped on a phone's calendar, open in a sheet. */
  const [sheet, setSheet] = useState<CalEvent | null>(null);
  /** Kept mounted once opened, so closing the drawer never throws the map away. */
  const [mapMounted, setMapMounted] = useState(mapOpen);
  if (mapShown && !mapMounted) setMapMounted(true);
  const [preview, setPreview] = useState<{ events: CalEvent[]; label: string } | null>(null);
  const [focusCode, setFocusCode] = useState<string | null>(null);
  const [hl, setHl] = useState<Highlight | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  // With courses on the schedule, the rail opens on choosing their sections.
  const tab: RailTab = chosenTab || (selectedCourses.length ? "sections" : "browse");

  const toggleMap = useCallback(
    (open?: boolean) => setMapFlag((open ?? !mapOpen) ? "1" : "0"),
    [mapOpen, setMapFlag],
  );

  // "M" toggles the map; Escape lets go of whatever is focused or previewed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "m" || e.key === "M") toggleMap();
      if (e.key === "Escape") {
        setFocusCode(null);
        setPreview(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMap]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const courseByCode = useMemo(() => {
    const m = new Map<string, Course>();
    for (const { course } of selectedCourses) m.set(course.code, course);
    return m;
  }, [selectedCourses]);

  // A focused course that left the schedule is no longer focused.
  const focus = focusCode && courseByCode.has(focusCode) ? focusCode : null;
  // Likewise a highlight: a card removed under the pointer never fires its
  // mouseleave, and a highlight left on it dimmed every other block.
  const lit = hl && (!hl.code || courseByCode.has(hl.code)) ? hl : null;
  // A touch screen has no hover: a tap fires mouseenter and never mouseleave,
  // so a hover highlight set there stuck, dimming the rest of the week.
  const hover = useCallback((h: Highlight | null) => { if (canHover) setHl(h); }, [canHover]);

  // ── What the calendar draws besides commitments ─────────────────────────────

  /** Options for a course whose lecture is chosen but whose discussion is not. */
  const pendingEvents = useMemo((): CalEvent[] => {
    const out: CalEvent[] = [];
    for (const { course } of selectedCourses) {
      if (course.code === focus) continue;
      const sec = sectionsByCode[course.code];
      if (!sec?.length) continue;
      const sel = selections[course.code];
      const fam = findFamily(groupSections(sec), sel?.family);
      if (!fam) continue;
      const src = { code: course.code, title: course.title, role: roleOf(course) };
      for (const p of fam.parts) {
        if (sel?.parts[p.type] || p.sections.length > MAX_PENDING_OPTIONS) continue;
        for (const s of p.sections) {
          for (const r of rowsFor(p, s[CODE])) {
            out.push(...eventsForRow(src, r, {
              ghost: "option",
              choice: { family: fam.key, part: p.type, code: s[CODE] },
            }));
          }
        }
      }
    }
    return out;
  }, [selectedCourses, sectionsByCode, selections, roleOf, focus]);

  /** Every alternative for the focused course — how you swap a discussion on the calendar. */
  const focusEvents = useMemo((): CalEvent[] => {
    if (!focus) return [];
    const course = courseByCode.get(focus);
    const sec = sectionsByCode[focus];
    if (!course || !sec?.length) return [];
    const families = groupSections(sec);
    const sel = selections[focus];
    const fam = findFamily(families, sel?.family);
    if (!fam) return []; // its lecture options are already drawn
    const src = { code: course.code, title: course.title, role: roleOf(course) };
    const out: CalEvent[] = [];
    for (const f of families) {
      if (f.key === fam.key) continue;
      for (const r of f.lectureRows) {
        out.push(...eventsForRow(src, r, { ghost: "option", choice: { family: f.key, part: null, code: r[CODE] } }));
      }
    }
    for (const p of fam.parts) {
      for (const s of p.sections) {
        if (sel?.parts[p.type] === s[CODE]) continue;
        for (const r of rowsFor(p, s[CODE])) {
          out.push(...eventsForRow(src, r, {
            ghost: "option",
            choice: { family: fam.key, part: p.type, code: s[CODE] },
          }));
        }
      }
    }
    return out;
  }, [focus, courseByCode, sectionsByCode, selections, roleOf]);

  const ghosts = useMemo(
    () => [...optionEvents, ...pendingEvents, ...focusEvents, ...(preview?.events ?? [])],
    [optionEvents, pendingEvents, focusEvents, preview],
  );

  // ── Walking ─────────────────────────────────────────────────────────────────

  const rough = useMemo(() => WEEKDAYS.map((d) => planDay(events, d, buildings)), [events, buildings]);
  const worried = rough.some((p) => troubleLegs(p).length > 0);
  // UCSD is asked only when something will show the answer: the open map, or a
  // warning an estimate raised that a real route might settle.
  const { routes, source: routeSource } = useWalkRoutes(events, term, mapShown || worried);
  const plans = useMemo(
    () => WEEKDAYS.map((d) => planDay(events, d, buildings, routes)),
    [events, buildings, routes],
  );
  const troubles = useMemo(() => plans.flatMap(troubleLegs), [plans]);

  // ── Exams ───────────────────────────────────────────────────────────────────

  const exams = useMemo((): ExamItem[] => {
    const out: ExamItem[] = [];
    for (const { course } of selectedCourses) {
      const sec = sectionsByCode[course.code];
      if (!sec?.length) continue;
      const chosen = selectedSections(groupSections(sec), selections[course.code]);
      for (const row of oneOffsFor(sec, chosen)) out.push({ code: course.code, role: roleOf(course), row });
    }
    return out;
  }, [selectedCourses, sectionsByCode, selections, roleOf]);

  // ── Interactions ────────────────────────────────────────────────────────────

  const previewFromRail = useCallback((p: Preview | null) => {
    // Previews answer a hover; on a touch screen the tap that would show one
    // also chooses, and the preview it left behind outlived the choice.
    if (!p || !canHover) { setPreview(null); return; }
    const course = courseByCode.get(p.code);
    if (!course) return;
    const src = { code: course.code, title: course.title, role: roleOf(course) };
    setPreview({
      events: p.rows.flatMap((r) => eventsForRow(src, r, { ghost: "preview" })),
      label: `${p.code} ${p.label}`,
    });
  }, [courseByCode, roleOf, canHover]);

  const hoverOnCalendar = useCallback((e: CalEvent | null) => {
    if (!e) {
      setHl(null);
      setPreview(null);
      return;
    }
    if (e.ghost === "option") {
      if (!canHover) return;
      // Hovering an option shows it on the map, with the walk it would make.
      const same = ghosts.filter(
        (g) => g.ghost === "option" && g.code === e.code && g.sectionCode === e.sectionCode && g.kind === e.kind,
      );
      setPreview({
        events: same.map((g) => ({ ...g, ghost: "preview" as const, key: `preview-${g.key}` })),
        label: `${e.code} ${e.kindLabel} ${e.sectionCode ?? ""}`,
      });
      return;
    }
    hover({ code: e.code, building: e.buildingCode || null });
  }, [ghosts, hover, canHover]);

  const pickOnCalendar = useCallback((e: CalEvent) => {
    if (isPhone) {
      // No hover and no rail beside the week: the details come up in a sheet,
      // and the class stays lit behind it.
      setSheet(e);
      setHl({ code: e.code, building: e.buildingCode || null });
      return;
    }
    setFocusCode((cur) => (cur === e.code ? null : e.code));
    pickTab("sections");
  }, [pickTab, isPhone]);

  const closeSheet = useCallback(() => {
    setSheet(null);
    setHl(null);
  }, []);

  const chooseOnCalendar = useCallback((e: CalEvent) => {
    if (!e.choice) return;
    chooseOption(e.code, e.choice);
    setPreview(null);
    // Swapping a discussion is done in one click; choosing a lecture usually
    // leaves its discussion to pick, so the course stays in focus.
    if (e.choice.part) setFocusCode((cur) => (cur === e.code ? null : cur));
  }, [chooseOption]);

  // Adding from Browse says where the sections went, instead of nothing.
  const addFromBrowse = useCallback((course: Course) => {
    addToSchedule(course);
    setToast({
      text: `${course.code} added`,
      action: { label: "Choose sections →", run: () => { pickTab("sections"); pickView("courses"); setFocusCode(course.code); } },
    });
    // The phone's default view follows the schedule; adding a course must not
    // whisk someone off the list they are adding from.
    if (!chosenView) pickView("courses");
  }, [addToSchedule, pickTab, pickView, chosenView]);

  // Removing is one click, so undoing it is too. A course and its section picks
  // were minutes of work; a confirm dialog would tax every removal instead.
  const removeWithUndo = useCallback((id: string) => {
    const snapshot = selectedCourses;
    const gone = snapshot.find((c) => c.id === id);
    if (!gone) return;
    removeFromSchedule(id);
    setPreview(null);
    setToast({ text: `${gone.course.code} removed`, action: { label: "Undo", run: () => restoreSchedule(snapshot) } });
  }, [selectedCourses, removeFromSchedule, restoreSchedule]);

  const clearWithUndo = useCallback(() => {
    const snapshot = selectedCourses;
    if (!snapshot.length) return;
    clearSchedule();
    setToast({
      text: `Cleared ${snapshot.length} ${snapshot.length === 1 ? "course" : "courses"}`,
      action: { label: "Undo", run: () => restoreSchedule(snapshot) },
    });
  }, [selectedCourses, clearSchedule, restoreSchedule]);

  const pending = selectedCourses.filter(({ course }) => {
    const st = sectionStatus(course.code);
    return st.available && !st.complete;
  }).length;

  const railTab = (id: RailTab, label: string, Icon: typeof Search, badge?: { n: number; warn: boolean }) => {
    const active = tab === id;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => pickTab(id)}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-semibold transition ${
          active
            ? "bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white"
            : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
        }`}
      >
        <Icon className="h-4 w-4" />
        {label}
        {badge && badge.n > 0 && (
          <span
            className={`rounded-full px-1.5 text-[11px] tabular-nums ${
              badge.warn
                ? "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200"
                : active
                  ? "bg-[#182B49] text-white dark:bg-[#FFCD00] dark:text-[#182B49]"
                  : "bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-gray-300"
            }`}
            title={badge.warn ? `${badge.n} ${badge.n === 1 ? "course needs" : "courses need"} a section picked` : undefined}
          >
            {badge.n}
          </span>
        )}
      </button>
    );
  };

  const scheduledCodes = useMemo(() => new Set(selectedCourses.map((sc) => sc.course.code)), [selectedCourses]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* ── Left rail ─────────────────────────────────────────────────────── */}
        {/* Folds to a strip once the sections are picked, handing the calendar
            and map the width; its two tabs stay one click away. */}
        {!railOpen && (
          <aside
            aria-label="Course rail, collapsed"
            className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-gray-200 bg-white py-2 dark:border-white/10 dark:bg-gray-800 max-md:hidden"
          >
            <button
              type="button"
              onClick={() => setRailFlag("1")}
              title="Show the course rail"
              aria-label="Show the course rail"
              className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
            <span aria-hidden className="my-1 h-px w-6 bg-gray-200 dark:bg-white/10" />
            {([["sections", "Sections", ListChecks], ["browse", "Browse", Search]] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => { pickTab(id); setRailFlag("1"); }}
                title={id === "sections" && pending ? `${label} — ${pending} to pick` : label}
                aria-label={id === "sections" && pending ? `${label}, ${pending} to pick` : label}
                className="relative rounded-lg p-2 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <Icon className="h-4 w-4" />
                {id === "sections" && pending > 0 && (
                  <span aria-hidden className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-gray-800" />
                )}
              </button>
            ))}
          </aside>
        )}
        <aside
          aria-label="Course rail"
          className={`relative flex w-[340px] shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white dark:border-white/10 dark:bg-gray-800 max-md:w-full max-md:border-r-0 ${
            railOpen ? "" : "md:hidden"
          } ${view === "courses" ? "" : "max-md:hidden"}`}
        >
          <div className="m-2 flex shrink-0 items-center gap-1">
            <div
              role="tablist"
              aria-label="Course rail"
              className="flex flex-1 gap-1 rounded-xl bg-gray-100 p-1 dark:bg-white/5"
            >
              {railTab("sections", "Sections", ListChecks, {
                n: pending || selectedCourses.length,
                warn: pending > 0,
              })}
              {railTab("browse", "Browse", Search)}
            </div>
            <button
              type="button"
              onClick={() => setRailFlag("0")}
              title="Hide the course rail"
              aria-label="Hide the course rail"
              className="shrink-0 rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white max-md:hidden"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          {tab === "sections" ? (
            <SectionBoard
              selectedCourses={selectedCourses}
              platRows={platRows}
              platByCode={platByCode}
              sectionsByCode={sectionsByCode}
              tssByCode={tssByCode}
              selections={selections}
              committed={events}
              buildings={buildings}
              conflictCodes={conflictCodes}
              focusCode={focus}
              roleOf={roleOf}
              sectionStatus={sectionStatus}
              onRemove={removeWithUndo}
              onSelect={setSelection}
              onAutoPick={autoPickFor}
              onClear={clearWithUndo}
              onAdd={(code) => {
                if (!chosenView) pickView("courses");
                return addCourseByCode(code);
              }}
              onPreview={previewFromRail}
              onHover={(code) => hover(code ? { code } : null)}
              onFocus={(code) => {
                setFocusCode(code);
                // "Compare" draws a course's options on the week, so show the week.
                if (isPhone && code) pickView("week");
              }}
            />
          ) : (
            <CourseCatalog
              darkMode={darkMode}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              selectedCourses={selectedCourses}
              addToSchedule={addFromBrowse}
              removeFromSchedule={removeWithUndo}
              getColorForCourse={getColorForCourse}
              activeRequirements={activeRequirements}
              selectedMajor={selectedMajor}
              selectedMinor={selectedMinor}
              selectedCollege={selectedCollege}
              plannedCourses={plannedCourses}
              addAICourseToPlan={addAICourseToPlan}
              removePlannedCourse={removePlannedCourse}
              platRows={platRows}
              legend={<ColorLegend />}
              savedPanel={
                <SavedCourses
                  saved={savedCourses}
                  scheduledCodes={scheduledCodes}
                  roleOf={roleOf}
                  onAdd={addFromBrowse}
                  onRemoveSaved={toggleSaved}
                />
              }
            />
          )}
        </aside>

        {/* ── Calendar ──────────────────────────────────────────────────────── */}
        <main className={`relative flex min-w-0 flex-1 flex-col overflow-hidden ${view === "week" ? "" : "max-md:hidden"}`}>
          <div
            className={`flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2 md:px-4 ${
              darkMode ? "border-white/10" : "border-gray-200"
            }`}
          >
            <h1 className="text-sm font-bold">Fall 2026</h1>
            <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
              {selectedCourses.length} {selectedCourses.length === 1 ? "course" : "courses"} ·{" "}
              {totalUnits} units
            </span>

            {conflictCodes.size > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:bg-red-500/15 dark:text-red-400">
                <AlertTriangle className="h-3 w-3" />
                {conflictCodes.size} clashing
              </span>
            )}
            {troubles.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const first = troubles[0].from.event.day;
                  pickDay(first);
                  if (isPhone) pickView("map");
                  else toggleMap(true);
                }}
                className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300"
                title="Classes too far apart for the break between them — open the map to see the walk"
              >
                <Footprints className="h-3 w-3" />
                {troubles.length} tight {troubles.length === 1 ? "walk" : "walks"}
              </button>
            )}

            <div className="ml-auto flex items-center gap-2">
              <PassStrip />
              <button
                type="button"
                onClick={autoPickAll}
                disabled={!selectedCourses.length}
                className="flex items-center gap-1.5 rounded-lg bg-[#182B49] px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1e3a63] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#FFCD00] dark:text-[#182B49] dark:hover:bg-[#FFD740]"
              >
                <Wand2 className="h-3.5 w-3.5" />
                Fit my sections
              </button>
              <button
                type="button"
                onClick={() => toggleMap()}
                aria-pressed={mapOpen}
                aria-keyshortcuts="M"
                title={mapOpen ? "Close the campus map (M)" : "Open the campus map (M)"}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition max-md:hidden ${
                  mapOpen
                    ? "border-[#182B49] bg-[#182B49]/5 text-[#182B49] dark:border-[#FFCD00] dark:bg-[#FFCD00]/10 dark:text-[#FFCD00]"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-white/15 dark:text-gray-200 dark:hover:bg-white/5"
                }`}
              >
                <MapIcon className="h-3.5 w-3.5" />
                Map
              </button>
            </div>
          </div>

          {/* A phone's week is five narrow columns; a day is one wide one. */}
          <div role="tablist" aria-label="Day" className="flex shrink-0 gap-1 border-b border-gray-200 px-2 py-1.5 dark:border-white/10 md:hidden">
            {([null, ...WEEKDAYS] as (DayOfWeek | null)[]).map((d) => {
              const active = d === phoneDay;
              const empty = d != null && !events.some((e) => e.day === d);
              return (
                <button
                  key={d ?? "week"}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPhoneDay(d)}
                  className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${
                    active
                      ? "bg-[#182B49] text-white dark:bg-[#FFCD00] dark:text-[#182B49]"
                      : empty
                        ? "text-gray-400 dark:text-gray-500"
                        : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {d ?? "Week"}
                </button>
              );
            })}
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto p-2 md:p-4"
            onClick={(e) => {
              // A click on empty space lets go of a focused course.
              if (e.target === e.currentTarget) setFocusCode(null);
            }}
          >
            <WeekCalendar
              events={events}
              ghosts={ghosts}
              darkMode={darkMode}
              highlight={lit}
              focusCode={focus}
              troubles={troubles}
              onRemove={(code) => {
                const hit = selectedCourses.find((sc) => sc.course.code === code);
                if (hit) removeWithUndo(hit.id);
              }}
              onHover={hoverOnCalendar}
              onPick={pickOnCalendar}
              onChoose={chooseOnCalendar}
              compact={isPhone && !phoneDay}
              days={isPhone && phoneDay ? [phoneDay] : undefined}
              onDayHeader={isPhone ? (d) => setPhoneDay((cur) => (cur ? null : d)) : undefined}
              emptyHint={
                isPhone
                  ? "Add a course on the Courses tab, then pick its sections — lectures and discussions both land here."
                  : undefined
              }
            />

            {(events.length > 0 || ghosts.length > 0) && (
              <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-3 w-1 rounded-sm bg-gray-400" />
                  Solid edge = lecture
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-3 w-1 rounded-sm border-l-2 border-dashed border-gray-400" />
                  Dashed edge = discussion or lab
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-3 w-4 rounded-sm border border-dashed border-gray-400"
                    style={{ background: "repeating-linear-gradient(135deg, #94a3b833 0 3px, transparent 3px 6px)" }}
                  />
                  Striped = an option — click to choose it
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-3 w-3 rounded-sm ring-2 ring-red-500" />
                  Red outline = time conflict
                </span>
                <span className="flex items-center gap-1.5">
                  <Footprints className="h-3 w-3 text-amber-500" />
                  = walk longer than the break
                </span>
              </p>
            )}

            <ExamList items={exams} />
          </div>

          {/* The pull tab: the map is one tug away even when the drawer is shut. */}
          {!mapOpen && (
            <button
              type="button"
              onClick={() => toggleMap(true)}
              title="Open the campus map (M)"
              className="absolute right-0 top-1/2 z-20 flex -translate-y-1/2 items-center gap-1.5 rounded-l-xl bg-[#182B49] px-1.5 py-3 text-[11px] font-semibold text-white shadow-lg transition hover:pr-2.5 dark:bg-[#FFCD00] dark:text-[#182B49] [writing-mode:vertical-rl] max-md:hidden"
            >
              <MapIcon className="h-3.5 w-3.5 rotate-90" />
              Campus map
              {troubles.length > 0 && (
                <span className="rounded-full bg-amber-400 px-1 text-[10px] text-amber-950 [writing-mode:horizontal-tb]">
                  {troubles.length}
                </span>
              )}
            </button>
          )}
        </main>

        {/* ── Campus map ────────────────────────────────────────────────────── */}
        <div
          className={`shrink-0 overflow-hidden transition-[width] duration-300 ease-out max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-30 max-lg:shadow-2xl motion-reduce:transition-none max-md:static max-md:w-full max-md:shadow-none max-md:transition-none ${
            mapOpen ? "w-[400px] xl:w-[440px]" : "w-0"
          } ${view === "map" ? "" : "max-md:hidden"}`}
          aria-hidden={!mapShown}
          inert={!mapShown}
        >
          <div className="h-full w-[400px] xl:w-[440px] max-md:w-full">
            {mapMounted && (
              <MapPanel
                darkMode={darkMode}
                events={events}
                preview={preview?.events ?? []}
                previewLabel={preview?.label ?? null}
                buildings={buildings}
                plans={plans}
                routeSource={routeSource}
                day={mapDay}
                onDay={pickDay}
                hotBuilding={lit?.building ?? null}
                hotCourse={lit?.code ?? null}
                onHotBuilding={(code) => hover(code ? { building: code } : null)}
                onClose={() => (isPhone ? pickView("week") : toggleMap(false))}
              />
            )}
          </div>
        </div>

        {/* Always mounted, so a screen reader hears each note as it appears. */}
        <div role="status" className="pointer-events-none absolute bottom-3 left-3 z-40 w-[316px] max-w-[calc(100%-1.5rem)]">
          {toast && (
            <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-[#182B49] px-3 py-2 text-[13px] text-white shadow-xl dark:bg-[#FFCD00] dark:text-[#182B49]">
              <span className="min-w-0 flex-1 truncate font-semibold">{toast.text}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => { toast.action?.run(); setToast(null); }}
                  className="shrink-0 rounded-md bg-white/15 px-2 py-1 text-xs font-semibold hover:bg-white/25 dark:bg-[#182B49]/15 dark:hover:bg-[#182B49]/25"
                >
                  {toast.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => setToast(null)}
                aria-label="Dismiss"
                className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {sheet && isPhone && (
          <EventSheet
            event={sheet}
            building={(sheet.buildingCode && buildings[sheet.buildingCode]) || null}
            onClose={closeSheet}
            onChangeSections={() => {
              setFocusCode(sheet.code);
              pickTab("sections");
              pickView("courses");
              closeSheet();
            }}
            onRemove={() => {
              const hit = selectedCourses.find((sc) => sc.course.code === sheet.code);
              if (hit) removeWithUndo(hit.id);
              closeSheet();
            }}
          />
        )}
      </div>

      {/* ── Phone tab bar ─────────────────────────────────────────────────── */}
      {/* One pane at a time, switched from under the thumb, as iOS apps do. */}
      <div
        role="tablist"
        aria-label="Planner views"
        className="flex shrink-0 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-white/10 dark:bg-gray-800 md:hidden"
      >
        {([
          ["courses", "Courses", ListChecks, pending, "bg-amber-500"],
          ["week", "Week", CalendarDays, conflictCodes.size, "bg-red-500"],
          ["map", "Map", MapIcon, troubles.length, "bg-amber-500"],
        ] as const).map(([id, label, Icon, badge, tone]) => {
          const active = view === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                pickView(id);
                closeSheet();
              }}
              className={`relative flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-1.5 text-[11px] font-semibold transition ${
                active ? "text-[#182B49] dark:text-[#FFCD00]" : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {/* Colour alone was too faint a difference between the tabs. */}
              <span
                className={`flex h-7 w-14 items-center justify-center rounded-full transition ${
                  active ? "bg-[#182B49]/10 dark:bg-[#FFCD00]/15" : ""
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              {label}
              {badge > 0 && (
                <span
                  className={`absolute left-1/2 top-1 ml-3 min-w-4 rounded-full px-1 text-center text-[10px] font-bold leading-4 text-white ${tone}`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

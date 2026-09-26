"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle, CalendarClock, Footprints, ListChecks, Map as MapIcon, PanelLeftClose, PanelLeftOpen,
  Search, Wand2, X,
} from "lucide-react";
import CourseCatalog from "@/components/triton/CourseCatalog";
import SavedCourses, { ColorLegend } from "@/components/triton/SavedCourses";
import SectionBoard, { type Preview } from "@/components/planner/SectionBoard";
import WeekCalendar, { type Highlight } from "@/components/planner/WeekCalendar";
import MapPanel, { type MapDay } from "@/components/planner/MapPanel";
import ExamList, { type ExamItem } from "@/components/planner/ExamList";
import { useWalkRoutes } from "@/components/planner/useWalkRoutes";
import { usePref } from "@/components/planner/usePref";
import type { Course } from "@/components/triton/types";
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
 */

type RailTab = "sections" | "browse";

// Per-viewer conveniences, not state anyone else needs.
const TAB_KEY = "ucsdplans-rail-tab";
const MAP_KEY = "ucsdplans-map-open";
const DAY_KEY = "ucsdplans-map-day";
const RAIL_KEY = "ucsdplans-rail-open";

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
  /** Kept mounted once opened, so closing the drawer never throws the map away. */
  const [mapMounted, setMapMounted] = useState(mapOpen);
  if (mapOpen && !mapMounted) setMapMounted(true);
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
  const { routes, source: routeSource } = useWalkRoutes(events, term, mapOpen || worried);
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
    if (!p) { setPreview(null); return; }
    const course = courseByCode.get(p.code);
    if (!course) return;
    const src = { code: course.code, title: course.title, role: roleOf(course) };
    setPreview({
      events: p.rows.flatMap((r) => eventsForRow(src, r, { ghost: "preview" })),
      label: `${p.code} ${p.label}`,
    });
  }, [courseByCode, roleOf]);

  const hoverOnCalendar = useCallback((e: CalEvent | null) => {
    if (!e) {
      setHl(null);
      setPreview(null);
      return;
    }
    if (e.ghost === "option") {
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
    setHl({ code: e.code, building: e.buildingCode || null });
  }, [ghosts]);

  const pickOnCalendar = useCallback((e: CalEvent) => {
    setFocusCode((cur) => (cur === e.code ? null : e.code));
    pickTab("sections");
  }, [pickTab]);

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
      action: { label: "Choose sections →", run: () => { pickTab("sections"); setFocusCode(course.code); } },
    });
  }, [addToSchedule, pickTab]);

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
    <div className="relative flex min-w-0 flex-1 overflow-hidden">
      {/* ── Left rail ─────────────────────────────────────────────────────── */}
      {/* Folds to a strip once the sections are picked, handing the calendar
          and map the width; its two tabs stay one click away. */}
      {!railOpen ? (
        <aside
          aria-label="Course rail, collapsed"
          className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-gray-200 bg-white py-2 dark:border-white/10 dark:bg-gray-800"
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
      ) : (
      <aside
        aria-label="Course rail"
        className="relative flex w-[340px] shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white dark:border-white/10 dark:bg-gray-800"
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
            className="shrink-0 rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
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
            onAdd={addCourseByCode}
            onPreview={previewFromRail}
            onHover={(code) => setHl(code ? { code } : null)}
            onFocus={setFocusCode}
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
      )}

      {/* ── Calendar ──────────────────────────────────────────────────────── */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className={`flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2 ${
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
                toggleMap(true);
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
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
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

        <div
          className="min-h-0 flex-1 overflow-y-auto p-4"
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
            className="absolute right-0 top-1/2 z-20 flex -translate-y-1/2 items-center gap-1.5 rounded-l-xl bg-[#182B49] px-1.5 py-3 text-[11px] font-semibold text-white shadow-lg transition hover:pr-2.5 dark:bg-[#FFCD00] dark:text-[#182B49] [writing-mode:vertical-rl]"
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
        className={`shrink-0 overflow-hidden transition-[width] duration-300 ease-out max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-30 max-lg:shadow-2xl motion-reduce:transition-none ${
          mapOpen ? "w-[400px] xl:w-[440px]" : "w-0"
        }`}
        aria-hidden={!mapOpen}
        inert={!mapOpen}
      >
        <div className="h-full w-[400px] xl:w-[440px]">
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
              onHotBuilding={(code) => setHl(code ? { building: code } : null)}
              onClose={() => toggleMap(false)}
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
    </div>
  );
}

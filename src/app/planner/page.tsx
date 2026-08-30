"use client";

import { useState, useSyncExternalStore } from "react";
import { AlertTriangle, CalendarClock, ListChecks, Search, Wand2 } from "lucide-react";
import CourseCatalog from "@/components/triton/CourseCatalog";
import SavedCourses, { ColorLegend } from "@/components/triton/SavedCourses";
import ScheduleRail from "@/components/planner/ScheduleRail";
import WeekCalendar from "@/components/planner/WeekCalendar";
import {
  noopSubscribe, passDate, timelineServerSnapshot, timelineSnapshot,
} from "@/lib/plat";
import { usePlanner } from "./PlannerProvider";

/**
 * The term workspace.
 *
 * Two panes, not three. The old middle column was squeezed between a catalog on
 * the left and a course list on the right, which left the calendar — the thing
 * you are here to look at — the narrowest element on screen. The course list is
 * now a tab in the left rail, and the calendar gets everything else.
 *
 * The rail follows UCSD's Class Planner in making sections the unit you commit
 * to; the toolbar follows UCSB's Plat in keeping the enrolment countdown and a
 * one-press "fit my sections together" in view while you work.
 */

type RailTab = "browse" | "schedule";

/** Enrolment passes: the deadline every one of these decisions is really about. */
function PassStrip() {
  const state = useSyncExternalStore(noopSubscribe, timelineSnapshot, timelineServerSnapshot);
  if (!state) return null;
  const { marks, countdown } = state;

  return (
    <div className="hidden items-center gap-2.5 lg:flex">
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
    selectedCourses, addToSchedule, removeFromSchedule, clearSchedule,
    sectionsByCode, selections, setSelection, autoPickFor, autoPickAll, sectionStatus,
    events, conflictCodes, totalUnits,
    plannedCourses, addAICourseToPlan, removePlannedCourse,
    platRows, allCourses, savedCourses, toggleSaved,
    selectedMajor, selectedMinor, selectedCollege,
    roleOf, getColorForCourse, activeRequirements,
  } = usePlanner();

  const [tab, setTab] = useState<RailTab>("browse");

  const railTab = (id: RailTab, label: string, Icon: typeof Search, count?: number) => {
    const active = tab === id;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => setTab(id)}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
          active
            ? darkMode
              ? "bg-white/10 text-white"
              : "bg-white text-gray-900 shadow-sm"
            : darkMode
              ? "text-gray-400 hover:text-gray-200"
              : "text-gray-500 hover:text-gray-800"
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
        {count != null && count > 0 && (
          <span
            className={`rounded-full px-1.5 text-[10px] tabular-nums ${
              active
                ? "bg-[#182B49] text-white dark:bg-[#FFCD00] dark:text-[#182B49]"
                : "bg-gray-200 text-gray-600 dark:bg-white/10 dark:text-gray-300"
            }`}
          >
            {count}
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      {/* ── Left rail ─────────────────────────────────────────────────────── */}
      <aside
        className={`flex w-[340px] shrink-0 flex-col overflow-hidden border-r ${
          darkMode ? "border-white/10 bg-gray-800" : "border-gray-200 bg-white"
        }`}
      >
        <div
          role="tablist"
          aria-label="Course rail"
          className={`m-2 flex shrink-0 gap-1 rounded-xl p-1 ${
            darkMode ? "bg-white/5" : "bg-gray-100"
          }`}
        >
          {railTab("browse", "Browse", Search)}
          {railTab("schedule", "Schedule", ListChecks, selectedCourses.length)}
        </div>

        {tab === "browse" ? (
          <CourseCatalog
            embedded
            darkMode={darkMode}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedCourses={selectedCourses}
            addToSchedule={addToSchedule}
            removeFromSchedule={removeFromSchedule}
            getColorForCourse={getColorForCourse}
            activeRequirements={activeRequirements}
            allCourses={allCourses}
            selectedMajor={selectedMajor}
            selectedMinor={selectedMinor}
            selectedCollege={selectedCollege}
            plannedCourses={plannedCourses}
            addAICourseToPlan={addAICourseToPlan}
            removePlannedCourse={removePlannedCourse}
            platRows={platRows}
            legend={<ColorLegend darkMode={darkMode} />}
            savedPanel={
              <SavedCourses
                darkMode={darkMode}
                saved={savedCourses}
                scheduledCodes={new Set(selectedCourses.map((sc) => sc.course.code))}
                roleOf={roleOf}
                onAdd={addToSchedule}
                onRemoveSaved={toggleSaved}
              />
            }
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ScheduleRail
              selectedCourses={selectedCourses}
              platRows={platRows}
              sectionsByCode={sectionsByCode}
              selections={selections}
              conflictCodes={conflictCodes}
              darkMode={darkMode}
              roleOf={roleOf}
              sectionStatus={sectionStatus}
              onRemove={removeFromSchedule}
              onSelect={setSelection}
              onAutoPick={autoPickFor}
              onClear={clearSchedule}
            />
          </div>
        )}
      </aside>

      {/* ── Calendar ──────────────────────────────────────────────────────── */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
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

          <div className="ml-auto flex items-center gap-3">
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
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <WeekCalendar
            events={events}
            darkMode={darkMode}
            onRemove={(code) => {
              const hit = selectedCourses.find((sc) => sc.course.code === code);
              if (hit) removeFromSchedule(hit.id);
            }}
          />

          {events.length > 0 && (
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-3 w-1 rounded-sm bg-gray-400" />
                Solid edge = lecture
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-3 w-1 rounded-sm border-l-2 border-dashed border-gray-400"
                />
                Dashed = discussion or lab
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-3 w-3 rounded-sm ring-2 ring-red-500" />
                Red outline = time conflict
              </span>
            </p>
          )}
        </div>
      </main>
    </>
  );
}

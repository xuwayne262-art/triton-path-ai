"use client";

import { Calendar, X } from "lucide-react";
import { DAYS, TIME_SLOTS } from "@/components/triton/types";
import CourseCatalog from "@/components/triton/CourseCatalog";
import SavedCourses, { ColorLegend } from "@/components/triton/SavedCourses";
import TermCourses from "@/components/triton/TermCourses";
import { usePlanner } from "./PlannerProvider";

/**
 * The term workspace: find a course, see where it lands in the week, check what
 * you are taking. Everything about the four years lives on its own page, so
 * this one only has to answer "does this quarter work?".
 */
export default function TermWorkspacePage() {
  const {
    darkMode,
    searchQuery, setSearchQuery,
    selectedCourses, addToSchedule, removeFromSchedule, clearSchedule, conflicts,
    plannedCourses, addAICourseToPlan, removePlannedCourse,
    platRows, allCourses, savedCourses, toggleSaved,
    selectedMajor, selectedMinor, selectedCollege,
    roleOf, getColorForCourse, activeRequirements,
  } = usePlanner();

  return (
    <>
      {/* Left pane ── course catalog */}
      <CourseCatalog
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

      {/* Centre pane ── weekly calendar */}
      <main className="flex-1 overflow-auto min-w-0">
        <div className="p-4">
          {selectedCourses.length === 0 ? (
            <div
              className={`flex flex-col items-center justify-center py-20 ${
                darkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              <Calendar className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg font-medium mb-2">No courses added yet</p>
              <p className="text-sm">
                Save courses from the Courses page, or add them from the catalog
              </p>
            </div>
          ) : (
            <div
              className={`rounded-xl overflow-hidden border shadow-sm ${
                darkMode ? "border-gray-700 bg-gray-800" : "border-slate-200 bg-white"
              }`}
            >
              {/* Day header row */}
              <div
                className={`grid border-b ${
                  darkMode ? "bg-gray-700 border-gray-600" : "bg-slate-50 border-slate-200"
                }`}
                style={{ gridTemplateColumns: "56px repeat(5, 1fr)" }}
              >
                <div />
                {DAYS.map((day) => (
                  <div
                    key={day}
                    className={`text-center text-sm font-semibold py-3 ${
                      darkMode ? "text-gray-300" : "text-slate-600"
                    }`}
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Grid body */}
              <div className="grid" style={{ gridTemplateColumns: "56px repeat(5, 1fr)" }}>
                {/* Time labels column */}
                <div
                  className={`flex flex-col border-r ${
                    darkMode ? "border-gray-700" : "border-slate-200"
                  }`}
                >
                  {TIME_SLOTS.filter((_, i) => i % 2 === 0).map((time) => (
                    <div
                      key={time}
                      className={`h-14 flex items-start justify-end pr-2 pt-1 text-xs ${
                        darkMode ? "text-gray-500" : "text-slate-400"
                      }`}
                    >
                      {time}
                    </div>
                  ))}
                </div>

                {/* Day columns */}
                {DAYS.map((day, dayIdx) => (
                  <div
                    key={day}
                    className={`relative min-h-[840px] ${
                      dayIdx < 4
                        ? darkMode
                          ? "border-r border-gray-700"
                          : "border-r border-slate-200"
                        : ""
                    }`}
                  >
                    {/* Hour lines */}
                    {TIME_SLOTS.filter((_, i) => i % 2 === 0).map((_, i) => (
                      <div
                        key={i}
                        className={`h-14 border-b ${
                          darkMode ? "border-gray-700" : "border-slate-200"
                        }`}
                      />
                    ))}

                    {/* Course blocks */}
                    {selectedCourses.map((sc) => {
                      const course = sc.course;
                      if (!course.time) return null;
                      return course.time
                        .filter((t) => t.day === day)
                        .map((t, tIdx) => {
                          const startHour = parseInt(t.start.split(":")[0]);
                          const startMin = parseInt(t.start.split(":")[1]);
                          const endHour = parseInt(t.end.split(":")[0]);
                          const endMin = parseInt(t.end.split(":")[1]);
                          const duration = (endHour - startHour) * 60 + (endMin - startMin);
                          const top = ((startHour - 8) * 60 + startMin) / 30 * 28;
                          const height = (duration / 30) * 28;
                          const color = getColorForCourse(sc.course);
                          const hasConflict = conflicts.some((c) => c.includes(sc.id));
                          return (
                            <div
                              key={`${sc.id}-${tIdx}`}
                              className={`group absolute left-1 right-1 rounded-lg p-2 overflow-hidden ${
                                hasConflict ? "ring-2 ring-red-500" : ""
                              } ${color.bg} ${color.border} border-l-4`}
                              style={{ top: `${top}px`, height: `${height}px` }}
                            >
                              <p className={`text-xs font-bold truncate pr-4 ${color.text}`}>
                                {course.code}
                              </p>
                              {height > 40 && (
                                <p className={`text-[10px] truncate ${color.text} opacity-80`}>
                                  {t.start} - {t.end}
                                </p>
                              )}
                              <button
                                onClick={() => removeFromSchedule(sc.id)}
                                aria-label={`Remove ${course.code}`}
                                className="absolute top-0.5 right-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity bg-white/70 hover:bg-white hover:text-red-600 text-gray-600"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        });
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Right pane ── this term's courses */}
      <TermCourses
        darkMode={darkMode}
        selectedCourses={selectedCourses}
        conflicts={conflicts}
        getColorForCourse={getColorForCourse}
        removeFromSchedule={removeFromSchedule}
        clearSchedule={clearSchedule}
      />
    </>
  );
}

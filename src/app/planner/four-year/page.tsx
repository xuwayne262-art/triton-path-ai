"use client";

import { Loader2, Plus, Sparkles, X } from "lucide-react";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { COLLEGE_REQUIREMENTS } from "@/data/requirements";
import RightSidebar from "@/components/triton/RightSidebar";
import { collegeGEs } from "@/lib/plat";
import { scheduleYear } from "@/lib/planSlot";
import { usePlanner, type Quarter, type Year } from "../PlannerProvider";

const YEARS: Year[] = [1, 2, 3, 4];
const QUARTERS: Quarter[] = ["Fall", "Winter", "Spring"];
/**
 * Hosted AI answers 503 unconditionally until authentication, eligibility and
 * usage limits exist (see "Hosted AI is turned off" in the README), so the
 * auto-fill button could only ever report an error. It stays hidden until the
 * server can say yes — flip this with it.
 */
const AI_AUTOFILL_ENABLED = false;

const YEAR_LABELS: Record<Year, string> = {
  1: "Freshman",
  2: "Sophomore",
  3: "Junior",
  4: "Senior",
};

/**
 * The four-year plan: twelve quarters, drag a course between them. It shares
 * the term workspace's courses through the planner provider, so anything added
 * here also has a place in the week, and vice versa.
 */
export default function FourYearPlanPage() {
  const {
    darkMode,
    plannedCourses, removePlannedCourse, addToPlanner, movePlannedCourse,
    plannerYear, setPlannerYear, plannerQuarter, setPlannerQuarter,
    isGeneratingPlan, planError, generateFourYearPlan,
    selectedCourses, selectedCollege, degreeProgress, progressCourses, getColorForCourse,
    termName, historyStatus, completedCount, retryHistory,
  } = usePlanner();

  // What the add button will actually move: this term's courses not already
  // somewhere in the plan. It used to promise every course on the schedule and
  // then add none when they were all planned already.
  const planned = new Set(plannedCourses.map((p) => p.course.code));
  const toAdd = selectedCourses.filter((sc) => !planned.has(sc.course.code)).length;
  const allPlanned = selectedCourses.length > 0 && toAdd === 0;
  // "Fall 2026 (Year 3)": which term, and where the plan already has it.
  const plannedYear = allPlanned ? scheduleYear(plannedCourses, selectedCourses.map((sc) => sc.course.code)) : null;
  const schedule = termName ? `your ${termName} schedule` : "this term’s schedule";
  const addLabel = allPlanned
    ? `${termName || "This term"}${plannedYear ? ` (Year ${plannedYear})` : ""} is already planned`
    : `Add ${toAdd} from ${termName || "this term"}`;
  const addTitle = allPlanned
    ? `Every course on ${schedule} is already in the plan${plannedYear ? `, in Year ${plannedYear}` : ""}`
    : selectedCourses.length === 0
      ? `Nothing is on ${schedule} yet — add courses on the This term tab first`
      : `Puts the ${toAdd} ${toAdd === 1 ? "course" : "courses"} on ${schedule} that ${toAdd === 1 ? "isn’t" : "aren’t"} planned yet into Year ${plannerYear}, ${plannerQuarter}`;

  const selectCls = `px-3 py-1.5 text-sm rounded-lg border ${
    darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-white border-gray-200"
  }`;
  const panelCls = `rounded-xl border ${
    darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
  }`;

  return (
    // Side by side on a desktop; on a phone the progress panel follows the
    // plan and the two scroll as one page.
    <div className="flex min-w-0 flex-1 overflow-hidden max-md:flex-col max-md:overflow-y-auto">
      <main className="min-w-0 flex-1 overflow-auto max-md:flex-none max-md:overflow-visible">
        <div className="p-3 md:p-4">
          {/* Controls — a toolbar row rather than a card: they set where the
              add button puts courses, and the plan below is the point. */}
          <div className="mb-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="plan-year"
                  className={`text-sm font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}
                >
                  Year:
                </label>
                <select
                  id="plan-year"
                  value={plannerYear}
                  onChange={(e) => setPlannerYear(Number(e.target.value) as Year)}
                  className={selectCls}
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      Year {y} - {YEAR_LABELS[y]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="plan-quarter"
                  className={`text-sm font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}
                >
                  Quarter:
                </label>
                <select
                  id="plan-quarter"
                  value={plannerQuarter}
                  onChange={(e) => setPlannerQuarter(e.target.value as Quarter)}
                  className={selectCls}
                >
                  {QUARTERS.map((q) => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
              </div>

              {/* Names the term and the courses it will move, since they live on
                  the other page. A disabled button shows no tooltip in every
                  browser, so the reason sits on a wrapper. */}
              <span title={addTitle} className="inline-flex">
                <Button
                  onClick={addToPlanner}
                  disabled={toAdd === 0}
                  className="bg-[#182B49] text-white hover:bg-[#1e3a63] dark:bg-[#FFCD00] dark:text-[#182B49] dark:hover:bg-[#FFD740]"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {addLabel}
                </Button>
              </span>

              {AI_AUTOFILL_ENABLED && <div className="ml-auto flex items-center gap-2">
                {planError && (
                  <span className="text-xs text-red-500 max-w-[180px] truncate">{planError}</span>
                )}
                <button
                  onClick={generateFourYearPlan}
                  disabled={isGeneratingPlan}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 text-white shadow-sm hover:shadow-md"
                >
                  {isGeneratingPlan ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Auto-Fill 4-Year Plan
                    </>
                  )}
                </button>
              </div>}
            </div>
          </div>

          {/* The college's GE requirements, for a phone only: from a tablet up
              the Degree Progress rail beside the plan lists the same ones, each
              with its progress, and this tile pushed the plan 220px down. */}
          {selectedCollege && (
            <div className={`mb-3 p-4 md:hidden ${panelCls}`}>
              <h3 className={`text-sm font-semibold mb-3 ${darkMode ? "text-white" : "text-gray-900"}`}>
                {collegeGEs(selectedCollege)}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {COLLEGE_REQUIREMENTS[selectedCollege].requirements.map((req) => (
                  <div
                    key={req.category}
                    className={`p-2 rounded-lg ${darkMode ? "bg-gray-700" : "bg-gray-50"}`}
                  >
                    <p className={`text-xs font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                      {req.label}
                    </p>
                    <p className={`text-[10px] mt-0.5 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                      {req.targetUnits} units
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Planned courses grid */}
          <DragDropContext onDragEnd={movePlannedCourse}>
            <div className={`overflow-hidden ${panelCls}`}>
              {/* One column per year with its heading on top. The headings used
                  to be a row of their own, which on a phone stacked all four
                  years' titles above all twelve quarters. */}
              <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2 lg:grid-cols-4">
                {YEARS.map((year) => (
                  <div key={year} className="space-y-2">
                    <div
                      className={`p-2 rounded-lg text-center ${darkMode ? "bg-gray-700" : "bg-gray-50"}`}
                    >
                      <p className={`font-semibold ${darkMode ? "text-white" : "text-gray-900"}`}>
                        Year {year}
                      </p>
                      <p className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                        {YEAR_LABELS[year]}
                      </p>
                    </div>
                    {QUARTERS.map((quarter) => {
                      const courses = plannedCourses.filter(
                        (p) => p.year === year && p.quarter === quarter,
                      );
                      const units = courses.reduce((sum, p) => sum + p.course.units, 0);
                      const droppableId = `${year}-${quarter}`;
                      return (
                        <Droppable droppableId={droppableId} key={droppableId}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              className={`p-2 rounded-lg min-h-[80px] transition-colors ${
                                snapshot.isDraggingOver
                                  ? darkMode
                                    ? "bg-blue-900/40 ring-1 ring-blue-500"
                                    : "bg-blue-50 ring-1 ring-blue-400"
                                  : darkMode
                                  ? "bg-gray-700/50"
                                  : "bg-gray-50/50"
                              }`}
                            >
                              <div className="flex items-baseline justify-between mb-1">
                                <p className="text-[10px] font-medium text-gray-400">{quarter}</p>
                                {units > 0 && (
                                  <p className="text-[10px] tabular-nums text-gray-400">{units}u</p>
                                )}
                              </div>
                              {courses.length === 0 && !snapshot.isDraggingOver && (
                                <p
                                  className={`text-[10px] ${
                                    darkMode ? "text-gray-600" : "text-gray-300"
                                  }`}
                                >
                                  No courses
                                </p>
                              )}
                              <div className="space-y-1">
                                {courses.map((pc, idx) => {
                                  const color = getColorForCourse(pc.course);
                                  return (
                                    <Draggable
                                      key={pc.courseId}
                                      draggableId={pc.courseId}
                                      index={idx}
                                    >
                                      {(dragProvided, dragSnapshot) => (
                                        <div
                                          ref={dragProvided.innerRef}
                                          {...dragProvided.draggableProps}
                                          {...dragProvided.dragHandleProps}
                                          className={`group relative text-[10px] pl-1.5 pr-5 py-1 rounded cursor-grab active:cursor-grabbing select-none transition-shadow ${color.bg} ${color.text} ${
                                            dragSnapshot.isDragging
                                              ? "shadow-lg ring-2 ring-white/50 scale-105"
                                              : "hover:shadow-sm"
                                          }`}
                                        >
                                          <span className="font-semibold">{pc.course.code}</span>
                                          <span className="opacity-70 ml-1">· {pc.course.units}u</span>
                                          {/* Dragging a course out of the grid was
                                              previously the only way to drop it. */}
                                          <button
                                            onClick={() => removePlannedCourse(pc.courseId)}
                                            aria-label={`Remove ${pc.course.code} from the plan`}
                                            className="absolute top-0.5 right-0.5 rounded p-0.5 text-gray-600 opacity-0 transition-opacity bg-white/70 hover:bg-white hover:text-red-600 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                                          >
                                            <X className="w-2.5 h-2.5" />
                                          </button>
                                        </div>
                                      )}
                                    </Draggable>
                                  );
                                })}
                              </div>
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </DragDropContext>
        </div>
      </main>

      {/* Right pane ── degree progress */}
      <RightSidebar
        darkMode={darkMode}
        degreeProgress={degreeProgress}
        courses={progressCourses}
        selectedCollege={selectedCollege}
        termName={termName}
        historyStatus={historyStatus}
        completedCount={completedCount}
        onRetryHistory={retryHistory}
      />
    </div>
  );
}

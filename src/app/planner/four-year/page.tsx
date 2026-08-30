"use client";

import { Loader2, Plus, Sparkles, X } from "lucide-react";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { COLLEGE_REQUIREMENTS } from "@/data/requirements";
import RightSidebar from "@/components/triton/RightSidebar";
import { usePlanner, type Quarter, type Year } from "../PlannerProvider";

const YEARS: Year[] = [1, 2, 3, 4];
const QUARTERS: Quarter[] = ["Fall", "Winter", "Spring"];
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
    selectedCourses, selectedCollege, degreeProgress, getColorForCourse,
  } = usePlanner();

  const selectCls = `px-3 py-1.5 text-sm rounded-lg border ${
    darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-white border-gray-200"
  }`;
  const panelCls = `rounded-xl border ${
    darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
  }`;

  return (
    <>
      <main className="flex-1 overflow-auto min-w-0">
        <div className="p-4">
          {/* Controls */}
          <div className={`mb-4 p-4 ${panelCls}`}>
            <div className="flex flex-wrap items-center gap-4">
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

              {/* Names the courses it will move, since they live on the other page. */}
              <Button
                onClick={addToPlanner}
                disabled={selectedCourses.length === 0}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add {selectedCourses.length} from this term
              </Button>

              <div className="ml-auto flex items-center gap-2">
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
              </div>
            </div>
          </div>

          {/* GE requirements tile */}
          {selectedCollege && (
            <div className={`mb-4 p-4 ${panelCls}`}>
              <h3 className={`text-sm font-semibold mb-3 ${darkMode ? "text-white" : "text-gray-900"}`}>
                {selectedCollege} College GE Requirements
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
              {/* Year header row */}
              <div className="grid grid-cols-4 gap-2 p-2">
                {YEARS.map((year) => (
                  <div
                    key={year}
                    className={`p-2 rounded-lg text-center ${darkMode ? "bg-gray-700" : "bg-gray-50"}`}
                  >
                    <p className={`font-semibold ${darkMode ? "text-white" : "text-gray-900"}`}>
                      Year {year}
                    </p>
                    <p className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                      {YEAR_LABELS[year]}
                    </p>
                  </div>
                ))}
              </div>

              {/* Quarter columns */}
              <div className="grid grid-cols-4 gap-2 p-2">
                {YEARS.map((year) => (
                  <div key={year} className="space-y-2">
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
                                            className="absolute top-0.5 right-0.5 rounded p-0.5 text-gray-600 opacity-0 transition-opacity bg-white/70 hover:bg-white hover:text-red-600 group-hover:opacity-100"
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
        selectedCourses={selectedCourses}
        selectedCollege={selectedCollege}
      />
    </>
  );
}

"use client";

import { GraduationCap } from "lucide-react";

interface Requirement {
  category: string;
  label: string;
  targetUnits: number;
  current: number;
}

interface DegreeProgressGroup {
  id: string;
  groupLabel: string;
  color: string;
  requirements: Requirement[];
}

interface ScheduleCourse {
  course: { units: number };
  id: string;
}

interface RightSidebarProps {
  darkMode: boolean;
  degreeProgress: DegreeProgressGroup[];
  selectedCourses: ScheduleCourse[];
  selectedCollege: string | null;
}

export default function RightSidebar({
  darkMode,
  degreeProgress,
  selectedCourses,
  selectedCollege,
}: RightSidebarProps) {
  const totalUnits = selectedCourses.reduce(
    (sum, c) => sum + c.course.units,
    0
  );

  return (
    <aside
      className={`w-64 flex-shrink-0 flex flex-col border-l overflow-hidden ${
        darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
      }`}
    >
      {/* Header */}
      <div
        className={`px-4 py-3 border-b flex-shrink-0 ${
          darkMode ? "border-gray-700" : "border-gray-200"
        }`}
      >
        <div className="flex items-center gap-1.5">
          <GraduationCap className="w-3.5 h-3.5 text-yellow-500" />
          <span
            className={`text-xs font-semibold ${
              darkMode ? "text-gray-200" : "text-gray-700"
            }`}
          >
            Degree Progress
          </span>
        </div>
        {!selectedCollege && (
          <p
            className={`text-[10px] mt-1 ${
              darkMode ? "text-gray-500" : "text-gray-400"
            }`}
          >
            Select a college above to see GE progress
          </p>
        )}
      </div>

      {/* Progress groups — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
        {degreeProgress.map((group) => (
          <div key={group.id}>
            {/* Group label */}
            <div className="flex items-center gap-1.5 mb-2">
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${group.color}`}
              />
              <span
                className={`text-[9px] font-bold uppercase tracking-widest truncate ${
                  darkMode ? "text-gray-500" : "text-gray-400"
                }`}
              >
                {group.groupLabel}
              </span>
            </div>

            {/* Requirements */}
            <div className="space-y-2 pl-3.5">
              {group.requirements.map((req) => {
                const pct =
                  req.targetUnits > 0
                    ? Math.min(
                        100,
                        Math.round((req.current / req.targetUnits) * 100)
                      )
                    : 0;
                const complete = req.current >= req.targetUnits;
                return (
                  <div key={req.category}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span
                        className={`text-[10px] font-medium truncate ${
                          darkMode ? "text-gray-300" : "text-gray-600"
                        }`}
                      >
                        {req.label}
                      </span>
                      <span
                        className={`text-[10px] tabular-nums ml-2 flex-shrink-0 ${
                          complete
                            ? "text-green-500 font-semibold"
                            : darkMode
                            ? "text-gray-500"
                            : "text-gray-400"
                        }`}
                      >
                        {req.current}/{req.targetUnits}u
                      </span>
                    </div>
                    <div
                      className={`h-1 rounded-full overflow-hidden ${
                        darkMode ? "bg-gray-700" : "bg-slate-200"
                      }`}
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-500 ease-out ${
                          group.color
                        }${complete ? " opacity-75" : ""}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {degreeProgress.length === 0 && (
          <p
            className={`text-xs text-center py-4 ${
              darkMode ? "text-gray-600" : "text-gray-400"
            }`}
          >
            No requirements loaded
          </p>
        )}
      </div>

      {/* Footer stats */}
      <div
        className={`px-4 py-3 border-t flex-shrink-0 text-xs ${
          darkMode
            ? "border-gray-700 text-gray-400"
            : "border-gray-200 text-gray-500"
        }`}
      >
        <div className="flex justify-between mb-1">
          <span>Selected courses</span>
          <span className="font-semibold">{selectedCourses.length}</span>
        </div>
        <div className="flex justify-between">
          <span>Total units</span>
          <span className="font-semibold">{totalUnits}</span>
        </div>
      </div>
    </aside>
  );
}

"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Moon, Sun, Plus, X, Calendar, BookOpen,
  GraduationCap, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DEPARTMENTS,
  COLLEGES,
  SAMPLE_COURSES,
  COURSE_COLORS,
  DAYS,
  TIME_SLOTS,
  type Course,
  type DayOfWeek,
  type College,
  type CourseTime,
} from "@/components/triton/types";
import {
  COLLEGE_REQUIREMENTS,
  MAJOR_REQUIREMENTS,
  MINOR_REQUIREMENTS,
} from "@/data/requirements";
import CourseCatalog from "@/components/triton/CourseCatalog";
import RightSidebar from "@/components/triton/RightSidebar";

// ── Module-level helpers ───────────────────────────────────────────────────────

function generateSampleTime(code: string): CourseTime[] {
  const hash = code.split("").reduce((a, b) => a + b.charCodeAt(0), 0);
  const allDays: DayOfWeek[][] = [
    ["Mon", "Wed", "Fri"],
    ["Tue", "Thu"],
    ["Mon", "Wed"],
    ["Tue", "Thu"],
    ["Mon"],
  ];
  const days = allDays[hash % 5];
  const startHour = 8 + (hash % 12);
  return days.map((day) => ({
    day,
    start: `${startHour.toString().padStart(2, "0")}:00`,
    end: `${startHour + 1 + (hash % 2)}:00`,
  }));
}

const coursesWithTimes: Course[] = SAMPLE_COURSES.map((c) => ({
  ...c,
  time: generateSampleTime(c.code),
}));

const MORE_DEPARTMENTS = [
  { code: "DS",   name: "Data Science",                courseCount: 45  },
  { code: "ECE",  name: "Electrical & Computer Eng",   courseCount: 134 },
  { code: "MAE",  name: "Mechanical & Aerospace Eng",  courseCount: 78  },
  { code: "BENG", name: "Bioengineering",               courseCount: 56  },
  { code: "NENG", name: "NanoEngineering",              courseCount: 45  },
  { code: "SE",   name: "Structural Engineering",       courseCount: 42  },
  { code: "CENG", name: "Chemical Engineering",         courseCount: 52  },
  { code: "JAMS", name: "Media",                        courseCount: 38  },
];

const ALL_DEPARTMENTS = [...DEPARTMENTS, ...MORE_DEPARTMENTS].sort((a, b) =>
  a.name.localeCompare(b.name)
);

// ── Types ──────────────────────────────────────────────────────────────────────

interface ScheduleCourse {
  course: Course;
  id: string;
}

interface PlannedCourse {
  courseId: string;
  course: Course;
  year: 1 | 2 | 3 | 4;
  quarter: "Fall" | "Winter" | "Spring";
}

// ── Page component ─────────────────────────────────────────────────────────────

export default function Home() {
  const [darkMode, setDarkMode] = useState(false);
  const [selectedCollege, setSelectedCollege] = useState<College | null>(null);
  const [selectedMajor, setSelectedMajor] = useState<string>("Computer Science (BS)");
  const [selectedMinor, setSelectedMinor] = useState<string>("None");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepartment] = useState<string | null>(null);
  const [selectedCourses, setSelectedCourses] = useState<ScheduleCourse[]>([]);
  const [plannedCourses, setPlannedCourses] = useState<PlannedCourse[]>([]);
  const [expandedDepts, setExpandedDepts] = useState<string[]>(["CSE", "MATH", "DSC"]);
  const [showPlanner, setShowPlanner] = useState(false);
  const [plannerYear, setPlannerYear] = useState<1 | 2 | 3 | 4>(1);
  const [plannerQuarter, setPlannerQuarter] = useState<"Fall" | "Winter" | "Spring">("Fall");
  const [conflicts, setConflicts] = useState<string[]>([]);

  // Dark mode class toggle
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  // Filtered course list
  const filteredCourses = useMemo(() => {
    return coursesWithTimes.filter((course) => {
      const matchesSearch =
        searchQuery === "" ||
        course.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.tags?.some((tag) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase())
        );

      const matchesDept =
        selectedDepartment === null ||
        course.departments?.includes(selectedDepartment);

      const matchesCollege =
        !course.collegeLimit ||
        selectedCollege === null ||
        course.collegeLimit.includes(selectedCollege);

      return matchesSearch && matchesDept && matchesCollege;
    });
  }, [searchQuery, selectedDepartment, selectedCollege]);

  // Time-conflict detection
  useEffect(() => {
    const newConflicts: string[] = [];
    for (let i = 0; i < selectedCourses.length; i++) {
      for (let j = i + 1; j < selectedCourses.length; j++) {
        const c1 = selectedCourses[i].course;
        const c2 = selectedCourses[j].course;
        if (c1.time && c2.time) {
          for (const t1 of c1.time) {
            for (const t2 of c2.time) {
              if (t1.day === t2.day) {
                const s1 = parseInt(t1.start.replace(":", ""));
                const e1 = parseInt(t1.end.replace(":", ""));
                const s2 = parseInt(t2.start.replace(":", ""));
                const e2 = parseInt(t2.end.replace(":", ""));
                if (s1 < e2 && s2 < e1) {
                  newConflicts.push(
                    `${selectedCourses[i].id}-${selectedCourses[j].id}`
                  );
                }
              }
            }
          }
        }
      }
    }
    setConflicts(newConflicts);
  }, [selectedCourses]);

  const addToSchedule = (course: Course) => {
    if (!selectedCourses.find((c) => c.course.id === course.id)) {
      setSelectedCourses([
        ...selectedCourses,
        { course, id: `${course.id}-${Date.now()}` },
      ]);
    }
  };

  const removeFromSchedule = (id: string) => {
    setSelectedCourses(selectedCourses.filter((c) => c.id !== id));
  };

  const addToPlanner = () => {
    selectedCourses.forEach((sc) => {
      if (!plannedCourses.find((pc) => pc.courseId === sc.course.id)) {
        setPlannedCourses([
          ...plannedCourses,
          {
            courseId: sc.course.id,
            course: sc.course,
            year: plannerYear,
            quarter: plannerQuarter,
          },
        ]);
      }
    });
  };

  const getColorForCourse = (index: number) =>
    COURSE_COLORS[index % COURSE_COLORS.length];

  const toggleDept = (code: string) => {
    setExpandedDepts((prev) =>
      prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]
    );
  };

  // Courses grouped by primary department (for CourseCatalog)
  const groupedCourses = useMemo(() => {
    const groups: Record<string, typeof filteredCourses> = {};
    filteredCourses.forEach((course) => {
      const dept = course.departments?.[0] ?? "Other";
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(course);
    });
    return groups;
  }, [filteredCourses]);

  // Merged flat dict: category → targetUnits
  const activeRequirements = useMemo((): Record<string, number> => {
    const majorReqs = MAJOR_REQUIREMENTS[selectedMajor] ?? {};
    const minorReqs = MINOR_REQUIREMENTS[selectedMinor] ?? {};
    const collegeReqs = selectedCollege
      ? Object.fromEntries(
          COLLEGE_REQUIREMENTS[selectedCollege].requirements.map((r) => [
            r.category,
            r.targetUnits,
          ])
        )
      : {};
    return { ...majorReqs, ...minorReqs, ...collegeReqs };
  }, [selectedMajor, selectedMinor, selectedCollege]);

  // Degree-audit groups (drives RightSidebar progress bars)
  const degreeProgress = useMemo(() => {
    const tally: Record<string, number> = {};
    selectedCourses.forEach(({ course }) => {
      course.categories?.forEach((cat) => {
        if (cat in activeRequirements) {
          tally[cat] = (tally[cat] ?? 0) + course.units;
        }
      });
    });

    const majorReqs = MAJOR_REQUIREMENTS[selectedMajor] ?? {};
    const majorGroup = {
      id: "major",
      groupLabel: `Major — ${selectedMajor}`,
      color: "bg-blue-500",
      requirements: Object.entries(majorReqs).map(([cat, target]) => ({
        category: cat,
        label: cat,
        targetUnits: target,
        current: tally[cat] ?? 0,
      })),
    };

    const groups = [majorGroup];

    if (selectedCollege) {
      const cg = COLLEGE_REQUIREMENTS[selectedCollege];
      groups.push({
        ...cg,
        requirements: cg.requirements.map((req) => ({
          ...req,
          current: tally[req.category] ?? 0,
        })),
      });
    }

    if (selectedMinor !== "None") {
      const minorReqs = MINOR_REQUIREMENTS[selectedMinor] ?? {};
      groups.push({
        id: "minor",
        groupLabel: `Minor — ${selectedMinor}`,
        color: "bg-teal-500",
        requirements: Object.entries(minorReqs).map(([cat, target]) => ({
          category: cat,
          label: cat,
          targetUnits: target,
          current: tally[cat] ?? 0,
        })),
      });
    }

    return groups;
  }, [selectedCourses, selectedCollege, selectedMajor, selectedMinor, activeRequirements]);

  // ── Shared select class helper ─────────────────────────────────────────────
  const selectCls = `text-sm rounded-lg border px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500 ${
    darkMode
      ? "bg-gray-700 border-gray-600 text-white"
      : "bg-white border-gray-200 text-gray-900"
  }`;

  const dividerCls = `w-px h-5 flex-shrink-0 ${
    darkMode ? "bg-gray-700" : "bg-gray-200"
  }`;

  const labelCls = `text-xs font-medium flex-shrink-0 ${
    darkMode ? "text-gray-400" : "text-gray-500"
  }`;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className={`h-screen flex flex-col ${
        darkMode ? "dark bg-gray-900" : "bg-slate-100"
      }`}
    >
      {/* ── Top Header Bar ─────────────────────────────────────────────────── */}
      <header
        className={`flex items-center gap-4 px-5 h-14 border-b flex-shrink-0 ${
          darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm"
            style={{
              background: darkMode ? "#FFCD00" : "#182B49",
              color: darkMode ? "#182B49" : "white",
            }}
          >
            T
          </div>
          <div className="hidden sm:block">
            <p
              className={`font-bold text-sm leading-tight ${
                darkMode ? "text-white" : "text-gray-900"
              }`}
            >
              TritonPath
            </p>
            <p
              className={`text-[10px] leading-none mt-0.5 ${
                darkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              UCSD Planner
            </p>
          </div>
        </div>

        <div className={dividerCls} />

        {/* Academic profile selectors — Major / Minor / College */}
        <div className="flex items-center gap-3 flex-1 min-w-0 overflow-x-auto">
          {/* Major */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <BookOpen className="w-3.5 h-3.5 text-gray-400" />
            <span className={labelCls}>Major</span>
            <select
              value={selectedMajor}
              onChange={(e) => setSelectedMajor(e.target.value)}
              className={selectCls}
            >
              {Object.keys(MAJOR_REQUIREMENTS).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className={dividerCls} />

          {/* Minor */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={labelCls}>Minor</span>
            <select
              value={selectedMinor}
              onChange={(e) => setSelectedMinor(e.target.value)}
              className={selectCls}
            >
              {Object.keys(MINOR_REQUIREMENTS).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className={dividerCls} />

          {/* College */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <GraduationCap className="w-3.5 h-3.5 text-gray-400" />
            <span className={labelCls}>College</span>
            <select
              value={selectedCollege ?? ""}
              onChange={(e) =>
                setSelectedCollege(
                  e.target.value ? (e.target.value as College) : null
                )
              }
              className={selectCls}
            >
              <option value="">— None —</option>
              {COLLEGES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: Pass Times badge + dark-mode toggle */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div
            className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${
              darkMode
                ? "bg-blue-900/50 text-blue-300"
                : "bg-blue-50 text-blue-700"
            }`}
          >
            <Calendar className="w-3 h-3" />
            <span>Pass 2 · Spring 2026</span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`p-1.5 rounded-lg ${
                  darkMode
                    ? "hover:bg-gray-700 text-yellow-400"
                    : "hover:bg-gray-100 text-gray-600"
                }`}
              >
                {darkMode ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {darkMode ? "Light Mode" : "Dark Mode"}
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      {/* ── 3-Pane Body ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left Pane ── Course Catalog */}
        <CourseCatalog
          darkMode={darkMode}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filteredCourses={filteredCourses}
          groupedCourses={groupedCourses}
          allDepartments={ALL_DEPARTMENTS}
          expandedDepts={expandedDepts}
          toggleDept={toggleDept}
          selectedCourses={selectedCourses}
          addToSchedule={addToSchedule}
          removeFromSchedule={removeFromSchedule}
          getColorForCourse={getColorForCourse}
        />

        {/* Center Pane ── Weekly Schedule / 4-Year Planner */}
        <main className="flex-1 overflow-hidden flex flex-col min-w-0">
          {/* View toggle */}
          <div
            className={`flex items-center gap-2 px-4 py-2 border-b flex-shrink-0 ${
              darkMode
                ? "border-gray-700 bg-gray-800"
                : "border-gray-200 bg-white"
            }`}
          >
            <button
              onClick={() => setShowPlanner(false)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                !showPlanner
                  ? "bg-blue-600 text-white"
                  : darkMode
                  ? "text-gray-300 hover:bg-gray-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Calendar className="w-4 h-4 inline-block mr-1.5" />
              Weekly Schedule
            </button>
            <button
              onClick={() => setShowPlanner(true)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                showPlanner
                  ? "bg-blue-600 text-white"
                  : darkMode
                  ? "text-gray-300 hover:bg-gray-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <BookOpen className="w-4 h-4 inline-block mr-1.5" />
              4-Year Planner
            </button>
          </div>

          {/* ── Weekly Schedule View ───────────────────────────────────────── */}
          {!showPlanner && (
            <div className="flex-1 overflow-auto">
              <div className="p-4">
                {selectedCourses.length === 0 ? (
                  <div
                    className={`flex flex-col items-center justify-center h-full py-20 ${
                      darkMode ? "text-gray-400" : "text-gray-500"
                    }`}
                  >
                    <Calendar className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-lg font-medium mb-2">
                      No courses added yet
                    </p>
                    <p className="text-sm">
                      Search and add courses from the left sidebar
                    </p>
                  </div>
                ) : (
                  <div
                    className={`rounded-xl overflow-hidden border shadow-sm ${
                      darkMode
                        ? "border-gray-700 bg-gray-800"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    {/* Day header row */}
                    <div
                      className={`grid border-b ${
                        darkMode
                          ? "bg-gray-700 border-gray-600"
                          : "bg-slate-50 border-slate-200"
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
                    <div
                      className="grid"
                      style={{ gridTemplateColumns: "56px repeat(5, 1fr)" }}
                    >
                      {/* Time labels column */}
                      <div
                        className={`flex flex-col border-r ${
                          darkMode ? "border-gray-700" : "border-slate-200"
                        }`}
                      >
                        {TIME_SLOTS.filter((_, i) => i % 2 === 0).map(
                          (time) => (
                            <div
                              key={time}
                              className={`h-14 flex items-start justify-end pr-2 pt-1 text-xs ${
                                darkMode ? "text-gray-500" : "text-slate-400"
                              }`}
                            >
                              {time}
                            </div>
                          )
                        )}
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
                          {TIME_SLOTS.filter((_, i) => i % 2 === 0).map(
                            (_, i) => (
                              <div
                                key={i}
                                className={`h-14 border-b ${
                                  darkMode
                                    ? "border-gray-700"
                                    : "border-slate-200"
                                }`}
                              />
                            )
                          )}

                          {/* Course blocks */}
                          {selectedCourses.map((sc, idx) => {
                            const course = sc.course;
                            if (!course.time) return null;
                            return course.time
                              .filter((t) => t.day === day)
                              .map((t, tIdx) => {
                                const startHour = parseInt(
                                  t.start.split(":")[0]
                                );
                                const startMin = parseInt(
                                  t.start.split(":")[1]
                                );
                                const endHour = parseInt(t.end.split(":")[0]);
                                const endMin = parseInt(t.end.split(":")[1]);
                                const duration =
                                  (endHour - startHour) * 60 +
                                  (endMin - startMin);
                                const top =
                                  ((startHour - 8) * 60 + startMin) / 30 * 28;
                                const height = (duration / 30) * 28;
                                const color = getColorForCourse(idx);
                                const hasConflict = conflicts.some((c) =>
                                  c.includes(sc.id)
                                );
                                return (
                                  <div
                                    key={`${sc.id}-${tIdx}`}
                                    className={`group absolute left-1 right-1 rounded-lg p-2 overflow-hidden ${
                                      hasConflict ? "ring-2 ring-red-500" : ""
                                    } ${color.bg} ${color.border} border-l-4`}
                                    style={{
                                      top: `${top}px`,
                                      height: `${height}px`,
                                    }}
                                  >
                                    <p
                                      className={`text-xs font-bold truncate pr-4 ${color.text}`}
                                    >
                                      {course.code}
                                    </p>
                                    {height > 40 && (
                                      <p
                                        className={`text-[10px] truncate ${color.text} opacity-80`}
                                      >
                                        {t.start} - {t.end}
                                      </p>
                                    )}
                                    <button
                                      onClick={() => removeFromSchedule(sc.id)}
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

                {selectedCourses.length > 0 && (
                  <div className="mt-4 flex justify-center">
                    <button
                      onClick={() => setSelectedCourses([])}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm ${
                        darkMode
                          ? "text-gray-400 hover:bg-gray-700"
                          : "text-gray-500 hover:bg-gray-100"
                      }`}
                    >
                      <RotateCcw className="w-4 h-4" />
                      Clear Schedule
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 4-Year Planner View ────────────────────────────────────────── */}
          {showPlanner && (
            <div className="flex-1 overflow-auto">
              <div className="p-4">
                {/* Controls */}
                <div
                  className={`mb-4 p-4 rounded-xl border ${
                    darkMode
                      ? "bg-gray-800 border-gray-700"
                      : "bg-white border-gray-200"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <label
                        className={`text-sm font-medium ${
                          darkMode ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
                        Year:
                      </label>
                      <select
                        value={plannerYear}
                        onChange={(e) =>
                          setPlannerYear(
                            Number(e.target.value) as 1 | 2 | 3 | 4
                          )
                        }
                        className={`px-3 py-1.5 text-sm rounded-lg border ${
                          darkMode
                            ? "bg-gray-700 border-gray-600 text-white"
                            : "bg-white border-gray-200"
                        }`}
                      >
                        <option value={1}>Year 1 - Freshman</option>
                        <option value={2}>Year 2 - Sophomore</option>
                        <option value={3}>Year 3 - Junior</option>
                        <option value={4}>Year 4 - Senior</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <label
                        className={`text-sm font-medium ${
                          darkMode ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
                        Quarter:
                      </label>
                      <select
                        value={plannerQuarter}
                        onChange={(e) =>
                          setPlannerQuarter(
                            e.target.value as "Fall" | "Winter" | "Spring"
                          )
                        }
                        className={`px-3 py-1.5 text-sm rounded-lg border ${
                          darkMode
                            ? "bg-gray-700 border-gray-600 text-white"
                            : "bg-white border-gray-200"
                        }`}
                      >
                        <option value="Fall">Fall</option>
                        <option value="Winter">Winter</option>
                        <option value="Spring">Spring</option>
                      </select>
                    </div>
                    <Button
                      onClick={addToPlanner}
                      className="ml-auto bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Selected to Plan
                    </Button>
                  </div>
                </div>

                {/* GE requirements tile */}
                {selectedCollege && (
                  <div
                    className={`mb-4 p-4 rounded-xl border ${
                      darkMode
                        ? "bg-gray-800 border-gray-700"
                        : "bg-white border-gray-200"
                    }`}
                  >
                    <h3
                      className={`text-sm font-semibold mb-3 ${
                        darkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {selectedCollege} College GE Requirements
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {COLLEGE_REQUIREMENTS[selectedCollege].requirements.map(
                        (req) => (
                          <div
                            key={req.category}
                            className={`p-2 rounded-lg ${
                              darkMode ? "bg-gray-700" : "bg-gray-50"
                            }`}
                          >
                            <p
                              className={`text-xs font-medium ${
                                darkMode ? "text-gray-300" : "text-gray-700"
                              }`}
                            >
                              {req.label}
                            </p>
                            <p
                              className={`text-[10px] mt-0.5 ${
                                darkMode ? "text-gray-400" : "text-gray-500"
                              }`}
                            >
                              {req.targetUnits} units
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Planned courses grid */}
                <div
                  className={`rounded-xl overflow-hidden border ${
                    darkMode
                      ? "border-gray-700 bg-gray-800"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="grid grid-cols-4 gap-2 p-2">
                    {[1, 2, 3, 4].map((year) => (
                      <div
                        key={year}
                        className={`p-2 rounded-lg text-center ${
                          darkMode ? "bg-gray-700" : "bg-gray-50"
                        }`}
                      >
                        <p
                          className={`font-semibold ${
                            darkMode ? "text-white" : "text-gray-900"
                          }`}
                        >
                          Year {year}
                        </p>
                        <p
                          className={`text-xs ${
                            darkMode ? "text-gray-400" : "text-gray-500"
                          }`}
                        >
                          {year === 1
                            ? "Freshman"
                            : year === 2
                            ? "Sophomore"
                            : year === 3
                            ? "Junior"
                            : "Senior"}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-4 gap-2 p-2">
                    {[1, 2, 3, 4].map((year) => (
                      <div key={year} className="space-y-2">
                        {["Fall", "Winter", "Spring"].map((quarter) => {
                          const courses = plannedCourses.filter(
                            (p) => p.year === year && p.quarter === quarter
                          );
                          return (
                            <div
                              key={quarter}
                              className={`p-2 rounded-lg min-h-[80px] ${
                                darkMode ? "bg-gray-700/50" : "bg-gray-50/50"
                              }`}
                            >
                              <p
                                className={`text-[10px] font-medium mb-1 ${
                                  darkMode ? "text-gray-400" : "text-gray-400"
                                }`}
                              >
                                {quarter}
                              </p>
                              {courses.length === 0 ? (
                                <p
                                  className={`text-[10px] ${
                                    darkMode
                                      ? "text-gray-600"
                                      : "text-gray-300"
                                  }`}
                                >
                                  No courses
                                </p>
                              ) : (
                                <div className="space-y-1">
                                  {courses.map((pc, idx) => {
                                    const color = getColorForCourse(idx);
                                    return (
                                      <div
                                        key={pc.courseId}
                                        className={`text-[10px] px-1.5 py-0.5 rounded ${color.bg} ${color.text}`}
                                      >
                                        {pc.course.code}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Right Pane ── Degree Progress */}
        <RightSidebar
          darkMode={darkMode}
          degreeProgress={degreeProgress}
          selectedCourses={selectedCourses}
          selectedCollege={selectedCollege}
        />
      </div>
    </div>
  );
}

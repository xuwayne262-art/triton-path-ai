"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Moon, Sun, Plus, X, Calendar, BookOpen, ChevronLeft,
  GraduationCap, RotateCcw, Sparkles, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  COLLEGES,
  SAMPLE_COURSES,
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
import { UCSD_MAJORS, UCSD_MINORS } from "@/data/ucsdMajorsMinors";
import CourseCatalog from "@/components/triton/CourseCatalog";
import RightSidebar from "@/components/triton/RightSidebar";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { loadIndex, type CourseRow as PlatRow } from "@/lib/plat";
import { useShortlist } from "@/components/plat/useShortlist";
import {
  courseRole, majorSubjects, platRowToCourse, ROLE_STYLES,
  type CourseRole, type RoleContext,
} from "@/lib/plannerBridge";
import SavedCourses, { ColorLegend } from "@/components/triton/SavedCourses";

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
  const [selectedCourses, setSelectedCourses] = useState<ScheduleCourse[]>([]);
  const [plannedCourses, setPlannedCourses] = useState<PlannedCourse[]>([]);
  const [showPlanner, setShowPlanner] = useState(false);
  const [plannerYear, setPlannerYear] = useState<1 | 2 | 3 | 4>(1);
  const [plannerQuarter, setPlannerQuarter] = useState<"Fall" | "Winter" | "Spring">("Fall");
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // Combobox state for Major / Minor search
  // The explorer's saved list, resolved against the shared course dataset.
  const { codes: savedCodes, toggle: toggleSaved } = useShortlist();
  const [platRows, setPlatRows] = useState<PlatRow[]>([]);
  const majorSubjectSet = useMemo(() => majorSubjects(selectedMajor), [selectedMajor]);
  useEffect(() => { loadIndex().then((d) => setPlatRows(d.courses)).catch(() => {}); }, []);

  const platByCode = useMemo(() => {
    const m = new Map<string, PlatRow>();
    for (const r of platRows) m.set(r.k, r);
    return m;
  }, [platRows]);

  const savedCourses = useMemo(
    () =>
      savedCodes
        .map((code) => {
          const row = platByCode.get(code);
          return row ? { course: platRowToCourse(row, majorSubjectSet), row } : null;
        })
        .filter((x): x is { course: Course; row: PlatRow } => x !== null),
    [savedCodes, platByCode, majorSubjectSet],
  );

  const [majorSearch, setMajorSearch] = useState("");
  const [majorOpen, setMajorOpen] = useState(false);
  const [minorSearch, setMinorSearch] = useState("");
  const [minorOpen, setMinorOpen] = useState(false);
  const majorRef = useRef<HTMLDivElement>(null);
  const minorRef = useRef<HTMLDivElement>(null);

  // Close comboboxes on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (majorRef.current && !majorRef.current.contains(e.target as Node)) {
        setMajorOpen(false);
        setMajorSearch("");
      }
      if (minorRef.current && !minorRef.current.contains(e.target as Node)) {
        setMinorOpen(false);
        setMinorSearch("");
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Dark mode class toggle
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

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

  const addToSchedule = useCallback((course: Course) => {
    // Functional update: reading `selectedCourses` from the render closure meant
    // two adds in the same tick silently dropped one.
    setSelectedCourses((prev) => {
      if (prev.some((c) => c.course.id === course.id)) return prev;
      // Real meeting times come from the schedule snapshot; fall back to a
      // deterministic placeholder so the weekly grid can still place the block.
      const courseWithTime: Course = course.time?.length
        ? course
        : { ...course, time: generateSampleTime(course.code) };
      return [
        ...prev,
        { course: courseWithTime, id: `${course.id}-${Date.now()}-${prev.length}` },
      ];
    });
  }, []);

  /**
   * Saving a course in the explorer puts it straight onto the schedule. It used
   * to only populate the sidebar list, so "Save to planner" appeared to do
   * nothing until you found and pressed a second "+" — the button promised the
   * planner, so it should deliver the planner.
   *
   * The ref makes each code sync at most once per session, so removing a course
   * from the schedule sticks instead of being immediately re-added.
   */
  const syncedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const pending = savedCourses.filter(({ course }) => !syncedRef.current.has(course.code));
    if (!pending.length) return;
    for (const { course } of pending) {
      syncedRef.current.add(course.code);
      addToSchedule(course);
    }
  }, [savedCourses, addToSchedule]);


  const removeFromSchedule = (id: string) => {
    setSelectedCourses((prev) => prev.filter((c) => c.id !== id));
  };

  const addAICourseToPlan = (
    course: Course,
    year: 1 | 2 | 3 | 4,
    quarter: "Fall" | "Winter" | "Spring"
  ) => {
    const instanceId = `${course.id}-${Date.now()}`;
    // Give the course a generated time slot so it renders on the weekly calendar grid
    const courseWithTime: Course = { ...course, time: generateSampleTime(course.code) };
    // Add to the 4-Year Planner
    setPlannedCourses((prev) => [
      ...prev,
      { courseId: instanceId, course: courseWithTime, year, quarter },
    ]);
    // Add to the weekly schedule (skip if already present by original course.id)
    setSelectedCourses((prev) => {
      if (prev.find((sc) => sc.course.id === course.id)) return prev;
      return [...prev, { course: courseWithTime, id: instanceId }];
    });
  };

  const removePlannedCourse = (courseId: string) => {
    // Remove from both the planner and the weekly schedule
    setPlannedCourses((prev) => prev.filter((pc) => pc.courseId !== courseId));
    setSelectedCourses((prev) => prev.filter((sc) => sc.id !== courseId));
  };

  const onDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;
    const [yearStr, quarter] = destination.droppableId.split("-");
    const year = Number(yearStr) as 1 | 2 | 3 | 4;
    setPlannedCourses((prev) =>
      prev.map((pc) =>
        pc.courseId === draggableId
          ? { ...pc, year, quarter: quarter as "Fall" | "Winter" | "Spring" }
          : pc
      )
    );
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

  // ── AI 4-Year Plan Generator ──────────────────────────────────────────────────

  interface AICourse {
    id: string;
    name: string;
    units: number;
    term: string;
    year: string | number;
  }

  const generateFourYearPlan = async () => {
    setIsGeneratingPlan(true);
    setPlanError(null);
    try {
      const res = await fetch("/api/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedMajor, selectedCollege }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Server error");
      }

      const data = await res.json();
      const raw: unknown = JSON.parse(data.text);

      // Accept both a bare array and { courses: [...] }
      const aiCourses: AICourse[] = Array.isArray(raw)
        ? (raw as AICourse[])
        : ((raw as { courses?: AICourse[] }).courses ?? []);

      const validQuarters = ["Fall", "Winter", "Spring"] as const;

      const newPlanned: PlannedCourse[] = aiCourses.map((c, i) => {
        // Normalize year → 1 | 2 | 3 | 4
        const yearRaw =
          typeof c.year === "number"
            ? c.year
            : parseInt(String(c.year).replace(/\D/g, ""), 10);
        const year = ([1, 2, 3, 4] as const).includes(yearRaw as 1 | 2 | 3 | 4)
          ? (yearRaw as 1 | 2 | 3 | 4)
          : 1;

        // Normalize quarter — capitalize first letter
        const termNorm =
          c.term.charAt(0).toUpperCase() + c.term.slice(1).toLowerCase();
        const quarter = (
          validQuarters as readonly string[]
        ).includes(termNorm)
          ? (termNorm as "Fall" | "Winter" | "Spring")
          : "Fall";

        const courseWithTime: Course = {
          id: c.id.toLowerCase().replace(/\s+/g, ""),
          code: c.id,
          title: c.name,
          units: c.units ?? 4,
          departments: [c.id.split(" ")[0]],
          time: generateSampleTime(c.id),
        };

        return {
          courseId: `ai-${courseWithTime.id}-${i}`,
          course: courseWithTime,
          year,
          quarter,
        };
      });

      setPlannedCourses(newPlanned);
      setShowPlanner(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setPlanError(msg);
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const roleContext = useMemo<RoleContext>(() => ({
    majorCategories: new Set(Object.keys(MAJOR_REQUIREMENTS[selectedMajor] ?? {})),
    minorCategories: new Set(Object.keys(MINOR_REQUIREMENTS[selectedMinor] ?? {})),
    collegeSlug: selectedCollege ? selectedCollege.toLowerCase() : null,
    majorSubjects: majorSubjectSet,
  }), [selectedMajor, selectedMinor, selectedCollege, majorSubjectSet]);

  const roleOf = useCallback(
    (course: Course): CourseRole => courseRole(course, roleContext),
    [roleContext],
  );

  /**
   * Colour now encodes what a course counts toward. It used to be
   * COURSE_COLORS[index % 10] — decorative, and actively misleading, since two
   * blocks sharing a colour implied a relationship that did not exist.
   */
  const getColorForCourse = useCallback(
    (course: Course) => {
      const s = ROLE_STYLES[roleOf(course)];
      return { bg: s.bg, border: s.border, text: s.text, hex: s.hex };
    },
    [roleOf],
  );

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

  // ── Combobox selection handlers ────────────────────────────────────────────
  const handleSelectMajor = (major: string) => {
    setSelectedMajor(major);
    setMajorOpen(false);
    setMajorSearch("");
  };

  const handleSelectMinor = (minor: string) => {
    setSelectedMinor(minor);
    setMinorOpen(false);
    setMinorSearch("");
  };

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
        {/* Logo — also the way back to the course explorer */}
        <Link href="/" className="flex items-center gap-2.5 flex-shrink-0" title="Back to courses">
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
        </Link>

        <Link
          href="/"
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition flex-shrink-0 ${
            darkMode
              ? "text-gray-300 hover:bg-white/10"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Courses</span>
        </Link>

        <div className={dividerCls} />

        {/* Academic profile selectors — Major / Minor / College */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Major — searchable combobox */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <BookOpen className="w-3.5 h-3.5 text-gray-400" />
            <span className={labelCls}>Major</span>
            <div className="relative">
              <input
                type="text"
                placeholder="— Select a Major —"
                value={majorOpen ? majorSearch : selectedMajor}
                onFocus={() => { setMajorOpen(true); setMajorSearch(""); }}
                onBlur={() => setMajorOpen(false)}
                onChange={(e) => setMajorSearch(e.target.value)}
                className={`${selectCls} w-44 cursor-pointer`}
              />
              {majorOpen && (
                <ul
                  className={`absolute top-full left-0 z-50 mt-0.5 w-80 max-h-72 overflow-y-auto rounded-lg border shadow-lg m-0 p-0 list-none ${
                    darkMode ? "bg-gray-800 border-gray-600" : "bg-white border-gray-200"
                  }`}
                >
                  {(() => {
                    const filtered = !majorSearch
                      ? UCSD_MAJORS
                      : UCSD_MAJORS.filter((m) => m?.toLowerCase().includes(majorSearch.toLowerCase()));
                    if (filtered.length === 0) {
                      return (
                        <li className={`px-3 py-3 text-sm text-center list-none ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                          No majors found
                        </li>
                      );
                    }
                    return filtered.map((major) => (
                      <li
                        key={major}
                        onMouseDown={(e) => { e.preventDefault(); handleSelectMajor(major); }}
                        className={`px-3 py-1.5 text-sm cursor-pointer transition-colors list-none ${
                          major === selectedMajor
                            ? darkMode ? "bg-blue-800 text-blue-200" : "bg-blue-50 text-blue-700"
                            : darkMode ? "text-gray-200 hover:bg-gray-700" : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {major}
                      </li>
                    ));
                  })()}
                </ul>
              )}
            </div>
          </div>

          <div className={dividerCls} />

          {/* Minor — searchable combobox */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={labelCls}>Minor</span>
            <div className="relative">
              <input
                type="text"
                placeholder="— None / Select a Minor —"
                value={minorOpen ? minorSearch : selectedMinor === "None" ? "" : selectedMinor}
                onFocus={() => { setMinorOpen(true); setMinorSearch(""); }}
                onBlur={() => setMinorOpen(false)}
                onChange={(e) => setMinorSearch(e.target.value)}
                className={`${selectCls} w-36 cursor-pointer`}
              />
              {minorOpen && (
                <ul
                  className={`absolute top-full left-0 z-50 mt-0.5 w-64 max-h-64 overflow-y-auto rounded-lg border shadow-lg m-0 p-0 list-none ${
                    darkMode ? "bg-gray-800 border-gray-600" : "bg-white border-gray-200"
                  }`}
                >
                  {UCSD_MINORS.filter(
                    (m) => m === "None" || m.toLowerCase().includes(minorSearch.toLowerCase())
                  ).map((minor) => (
                    <li
                      key={minor}
                      onMouseDown={(e) => { e.preventDefault(); handleSelectMinor(minor); }}
                      className={`px-3 py-1.5 text-sm cursor-pointer transition-colors list-none ${
                        minor === selectedMinor
                          ? darkMode ? "bg-blue-800 text-blue-200" : "bg-blue-50 text-blue-700"
                          : minor === "None"
                          ? darkMode ? "text-gray-500 hover:bg-gray-700 italic" : "text-gray-400 hover:bg-gray-50 italic"
                          : darkMode ? "text-gray-200 hover:bg-gray-700" : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {minor === "None" ? "— None / No Minor —" : minor}
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
          selectedCourses={selectedCourses}
          addToSchedule={addToSchedule}
          removeFromSchedule={removeFromSchedule}
          getColorForCourse={getColorForCourse}
          activeRequirements={activeRequirements}
          allCourses={coursesWithTimes}
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

            {/* ── Auto-Fill 4-Year Plan ─────────────────────────────────────── */}
            <div className="ml-auto flex items-center gap-2">
              {planError && (
                <span className="text-xs text-red-500 max-w-[180px] truncate">
                  {planError}
                </span>
              )}
              <button
                onClick={generateFourYearPlan}
                disabled={isGeneratingPlan}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed
                  bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 text-white shadow-sm hover:shadow-md`}
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
                      Save courses from the Courses page, or add them from the sidebar
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
                                const color = getColorForCourse(sc.course);
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
                <DragDropContext onDragEnd={onDragEnd}>
                  <div
                    className={`rounded-xl overflow-hidden border ${
                      darkMode
                        ? "border-gray-700 bg-gray-800"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    {/* Year header row */}
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

                    {/* Quarter columns */}
                    <div className="grid grid-cols-4 gap-2 p-2">
                      {[1, 2, 3, 4].map((year) => (
                        <div key={year} className="space-y-2">
                          {(["Fall", "Winter", "Spring"] as const).map((quarter) => {
                            const courses = plannedCourses.filter(
                              (p) => p.year === year && p.quarter === quarter
                            );
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
                                    <p
                                      className={`text-[10px] font-medium mb-1 ${
                                        darkMode ? "text-gray-400" : "text-gray-400"
                                      }`}
                                    >
                                      {quarter}
                                    </p>
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
                                                className={`text-[10px] px-1.5 py-1 rounded cursor-grab active:cursor-grabbing select-none transition-shadow ${color.bg} ${color.text} ${
                                                  dragSnapshot.isDragging
                                                    ? "shadow-lg ring-2 ring-white/50 scale-105"
                                                    : "hover:shadow-sm"
                                                }`}
                                              >
                                                <span className="font-semibold">{pc.course.code}</span>
                                                <span className="opacity-70 ml-1">· {pc.course.units}u</span>
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

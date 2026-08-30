"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import type { DropResult } from "@hello-pangea/dnd";
import {
  SAMPLE_COURSES,
  type Course,
  type CourseTime,
  type DayOfWeek,
  type College,
} from "@/components/triton/types";
import {
  COLLEGE_REQUIREMENTS,
  MAJOR_REQUIREMENTS,
  MINOR_REQUIREMENTS,
} from "@/data/requirements";
import { loadIndex, type CourseRow as PlatRow } from "@/lib/plat";
import { useShortlist } from "@/components/plat/useShortlist";
import { useTheme } from "@/components/plat/theme";
import {
  courseRole, majorSubjects, platRowToCourse, ROLE_STYLES,
  type CourseRole, type RoleContext,
} from "@/lib/plannerBridge";

/**
 * The planner is two pages — the term workspace and the four-year plan — and
 * they are two views of one plan, not two plans. Everything they share lives
 * here, in a provider mounted by the /planner layout, so switching tabs keeps
 * the schedule intact and neither page owns state the other needs.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ScheduleCourse {
  course: Course;
  id: string;
}

export type Year = 1 | 2 | 3 | 4;
export type Quarter = "Fall" | "Winter" | "Spring";

export interface PlannedCourse {
  courseId: string;
  course: Course;
  year: Year;
  quarter: Quarter;
}

export interface CourseColor {
  bg: string;
  border: string;
  text: string;
  hex: string;
}

export interface DegreeProgressGroup {
  id: string;
  groupLabel: string;
  color: string;
  requirements: Array<{
    category: string;
    label: string;
    targetUnits: number;
    current: number;
  }>;
}

// ── Module-level helpers ───────────────────────────────────────────────────────

export function generateSampleTime(code: string): CourseTime[] {
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

// ── Persistence ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "tritonplat-planner";

interface Persisted {
  major: string;
  minor: string;
  college: College | null;
  schedule: ScheduleCourse[];
  planned: PlannedCourse[];
  /** Saved codes already pushed onto the schedule, so removals stick. */
  synced: string[];
}

function readPersisted(): Partial<Persisted> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : null;
  } catch {
    return null;
  }
}

// ── Context ────────────────────────────────────────────────────────────────────

interface PlannerValue {
  darkMode: boolean;
  toggleDarkMode: () => void;

  selectedMajor: string;
  setSelectedMajor: (m: string) => void;
  selectedMinor: string;
  setSelectedMinor: (m: string) => void;
  selectedCollege: College | null;
  setSelectedCollege: (c: College | null) => void;

  searchQuery: string;
  setSearchQuery: (q: string) => void;
  platRows: PlatRow[];
  allCourses: Course[];
  savedCourses: Array<{ course: Course; row: PlatRow }>;
  toggleSaved: (code: string) => void;

  selectedCourses: ScheduleCourse[];
  addToSchedule: (course: Course) => void;
  removeFromSchedule: (id: string) => void;
  clearSchedule: () => void;
  conflicts: string[];

  plannedCourses: PlannedCourse[];
  addAICourseToPlan: (course: Course, year: Year, quarter: Quarter) => void;
  removePlannedCourse: (courseId: string) => void;
  addToPlanner: () => void;
  movePlannedCourse: (result: DropResult) => void;
  plannerYear: Year;
  setPlannerYear: (y: Year) => void;
  plannerQuarter: Quarter;
  setPlannerQuarter: (q: Quarter) => void;

  isGeneratingPlan: boolean;
  planError: string | null;
  generateFourYearPlan: () => Promise<void>;

  roleOf: (course: Course) => CourseRole;
  getColorForCourse: (course: Course) => CourseColor;
  activeRequirements: Record<string, number>;
  degreeProgress: DegreeProgressGroup[];
}

const PlannerCtx = createContext<PlannerValue | null>(null);

export function usePlanner(): PlannerValue {
  const ctx = useContext(PlannerCtx);
  if (!ctx) throw new Error("usePlanner must be used inside <PlannerProvider>");
  return ctx;
}

export function PlannerProvider({ children }: { children: React.ReactNode }) {
  // The site already owns the theme; the planner used to keep its own flag and
  // clear the `dark` class on mount, silently undoing the user's choice.
  const { theme, toggle: toggleDarkMode } = useTheme();
  const darkMode = theme === "dark";

  const [selectedMajor, setSelectedMajor] = useState<string>("Computer Science (BS)");
  const [selectedMinor, setSelectedMinor] = useState<string>("None");
  const [selectedCollege, setSelectedCollege] = useState<College | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourses, setSelectedCourses] = useState<ScheduleCourse[]>([]);
  const [plannedCourses, setPlannedCourses] = useState<PlannedCourse[]>([]);
  const [plannerYear, setPlannerYear] = useState<Year>(1);
  const [plannerQuarter, setPlannerQuarter] = useState<Quarter>("Fall");
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [platRows, setPlatRows] = useState<PlatRow[]>([]);

  const { codes: savedCodes, toggle: toggleSaved } = useShortlist();
  const majorSubjectSet = useMemo(() => majorSubjects(selectedMajor), [selectedMajor]);

  useEffect(() => { loadIndex().then((d) => setPlatRows(d.courses)).catch(() => {}); }, []);

  // ── Rehydrate ───────────────────────────────────────────────────────────────
  // Read after mount, not in useState, so the server and first client render
  // agree. `hydrated` gates the writer below so an empty first render cannot
  // wipe a stored plan.
  const syncedRef = useRef<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = readPersisted();
    if (saved) {
      if (saved.major) setSelectedMajor(saved.major);
      if (saved.minor) setSelectedMinor(saved.minor);
      if (saved.college !== undefined) setSelectedCollege(saved.college);
      if (Array.isArray(saved.schedule)) setSelectedCourses(saved.schedule);
      if (Array.isArray(saved.planned)) setPlannedCourses(saved.planned);
      if (Array.isArray(saved.synced)) syncedRef.current = new Set(saved.synced);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const payload: Persisted = {
      major: selectedMajor,
      minor: selectedMinor,
      college: selectedCollege,
      schedule: selectedCourses,
      planned: plannedCourses,
      synced: [...syncedRef.current],
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {}
  }, [hydrated, selectedMajor, selectedMinor, selectedCollege, selectedCourses, plannedCourses]);

  // ── Saved courses from the explorer ─────────────────────────────────────────

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

  // ── Time-conflict detection ─────────────────────────────────────────────────

  useEffect(() => {
    const found: string[] = [];
    for (let i = 0; i < selectedCourses.length; i++) {
      for (let j = i + 1; j < selectedCourses.length; j++) {
        const c1 = selectedCourses[i].course;
        const c2 = selectedCourses[j].course;
        if (!c1.time || !c2.time) continue;
        for (const t1 of c1.time) {
          for (const t2 of c2.time) {
            if (t1.day !== t2.day) continue;
            const s1 = parseInt(t1.start.replace(":", ""));
            const e1 = parseInt(t1.end.replace(":", ""));
            const s2 = parseInt(t2.start.replace(":", ""));
            const e2 = parseInt(t2.end.replace(":", ""));
            if (s1 < e2 && s2 < e1) {
              found.push(`${selectedCourses[i].id}-${selectedCourses[j].id}`);
            }
          }
        }
      }
    }
    setConflicts(found);
  }, [selectedCourses]);

  // ── Schedule actions ────────────────────────────────────────────────────────

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

  const removeFromSchedule = useCallback((id: string) => {
    setSelectedCourses((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearSchedule = useCallback(() => setSelectedCourses([]), []);

  /**
   * Saving a course in the explorer puts it straight onto the schedule. It used
   * to only populate the sidebar list, so "Save to planner" appeared to do
   * nothing until you found and pressed a second "+" — the button promised the
   * planner, so it should deliver the planner.
   *
   * The ref makes each code sync at most once, so removing a course from the
   * schedule sticks instead of being immediately re-added. It is persisted for
   * the same reason: a reload would otherwise resurrect everything removed.
   */
  useEffect(() => {
    if (!hydrated) return;
    const pending = savedCourses.filter(({ course }) => !syncedRef.current.has(course.code));
    if (!pending.length) return;
    for (const { course } of pending) {
      syncedRef.current.add(course.code);
      addToSchedule(course);
    }
  }, [hydrated, savedCourses, addToSchedule]);

  // ── Plan actions ────────────────────────────────────────────────────────────

  const addAICourseToPlan = useCallback((course: Course, year: Year, quarter: Quarter) => {
    const instanceId = `${course.id}-${Date.now()}`;
    const courseWithTime: Course = { ...course, time: generateSampleTime(course.code) };
    setPlannedCourses((prev) => [
      ...prev,
      { courseId: instanceId, course: courseWithTime, year, quarter },
    ]);
    setSelectedCourses((prev) =>
      prev.some((sc) => sc.course.id === course.id)
        ? prev
        : [...prev, { course: courseWithTime, id: instanceId }],
    );
  }, []);

  const removePlannedCourse = useCallback((courseId: string) => {
    setPlannedCourses((prev) => prev.filter((pc) => pc.courseId !== courseId));
    setSelectedCourses((prev) => prev.filter((sc) => sc.id !== courseId));
  }, []);

  const addToPlanner = useCallback(() => {
    setPlannedCourses((prev) => {
      const have = new Set(prev.map((pc) => pc.courseId));
      const additions = selectedCourses
        .filter((sc) => !have.has(sc.course.id))
        .map((sc) => ({
          courseId: sc.course.id,
          course: sc.course,
          year: plannerYear,
          quarter: plannerQuarter,
        }));
      return additions.length ? [...prev, ...additions] : prev;
    });
  }, [selectedCourses, plannerYear, plannerQuarter]);

  const movePlannedCourse = useCallback((result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;
    const [yearStr, quarter] = destination.droppableId.split("-");
    const year = Number(yearStr) as Year;
    setPlannedCourses((prev) =>
      prev.map((pc) =>
        pc.courseId === draggableId ? { ...pc, year, quarter: quarter as Quarter } : pc,
      ),
    );
  }, []);

  // ── AI four-year plan generator ─────────────────────────────────────────────

  interface AICourse {
    id: string;
    name: string;
    units: number;
    term: string;
    year: string | number;
  }

  const generateFourYearPlan = useCallback(async () => {
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
        const yearRaw =
          typeof c.year === "number" ? c.year : parseInt(String(c.year).replace(/\D/g, ""), 10);
        const year = ([1, 2, 3, 4] as const).includes(yearRaw as Year) ? (yearRaw as Year) : 1;

        const termNorm = c.term.charAt(0).toUpperCase() + c.term.slice(1).toLowerCase();
        const quarter = (validQuarters as readonly string[]).includes(termNorm)
          ? (termNorm as Quarter)
          : "Fall";

        const courseWithTime: Course = {
          id: c.id.toLowerCase().replace(/\s+/g, ""),
          code: c.id,
          title: c.name,
          units: c.units ?? 4,
          departments: [c.id.split(" ")[0]],
          time: generateSampleTime(c.id),
        };

        return { courseId: `ai-${courseWithTime.id}-${i}`, course: courseWithTime, year, quarter };
      });

      setPlannedCourses(newPlanned);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsGeneratingPlan(false);
    }
  }, [selectedMajor, selectedCollege]);

  // ── Derived ─────────────────────────────────────────────────────────────────

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
    (course: Course): CourseColor => {
      const s = ROLE_STYLES[roleOf(course)];
      return { bg: s.bg, border: s.border, text: s.text, hex: s.hex };
    },
    [roleOf],
  );

  const activeRequirements = useMemo((): Record<string, number> => {
    const majorReqs = MAJOR_REQUIREMENTS[selectedMajor] ?? {};
    const minorReqs = MINOR_REQUIREMENTS[selectedMinor] ?? {};
    const collegeReqs = selectedCollege
      ? Object.fromEntries(
          COLLEGE_REQUIREMENTS[selectedCollege].requirements.map((r) => [r.category, r.targetUnits]),
        )
      : {};
    return { ...majorReqs, ...minorReqs, ...collegeReqs };
  }, [selectedMajor, selectedMinor, selectedCollege]);

  const degreeProgress = useMemo((): DegreeProgressGroup[] => {
    const tally: Record<string, number> = {};
    selectedCourses.forEach(({ course }) => {
      course.categories?.forEach((cat) => {
        if (cat in activeRequirements) tally[cat] = (tally[cat] ?? 0) + course.units;
      });
    });

    const majorReqs = MAJOR_REQUIREMENTS[selectedMajor] ?? {};
    const groups: DegreeProgressGroup[] = [{
      id: "major",
      groupLabel: `Major — ${selectedMajor}`,
      color: "bg-blue-500",
      requirements: Object.entries(majorReqs).map(([cat, target]) => ({
        category: cat, label: cat, targetUnits: target, current: tally[cat] ?? 0,
      })),
    }];

    if (selectedCollege) {
      const cg = COLLEGE_REQUIREMENTS[selectedCollege];
      groups.push({
        ...cg,
        requirements: cg.requirements.map((req) => ({ ...req, current: tally[req.category] ?? 0 })),
      });
    }

    if (selectedMinor !== "None") {
      const minorReqs = MINOR_REQUIREMENTS[selectedMinor] ?? {};
      groups.push({
        id: "minor",
        groupLabel: `Minor — ${selectedMinor}`,
        color: "bg-teal-500",
        requirements: Object.entries(minorReqs).map(([cat, target]) => ({
          category: cat, label: cat, targetUnits: target, current: tally[cat] ?? 0,
        })),
      });
    }

    return groups;
  }, [selectedCourses, selectedCollege, selectedMajor, selectedMinor, activeRequirements]);

  const value: PlannerValue = {
    darkMode, toggleDarkMode,
    selectedMajor, setSelectedMajor,
    selectedMinor, setSelectedMinor,
    selectedCollege, setSelectedCollege,
    searchQuery, setSearchQuery,
    platRows, allCourses: coursesWithTimes, savedCourses, toggleSaved,
    selectedCourses, addToSchedule, removeFromSchedule, clearSchedule, conflicts,
    plannedCourses, addAICourseToPlan, removePlannedCourse, addToPlanner, movePlannedCourse,
    plannerYear, setPlannerYear, plannerQuarter, setPlannerQuarter,
    isGeneratingPlan, planError, generateFourYearPlan,
    roleOf, getColorForCourse, activeRequirements, degreeProgress,
  };

  return <PlannerCtx.Provider value={value}>{children}</PlannerCtx.Provider>;
}

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
import {
  loadBuildings, loadIndex, loadSubject,
  type Building, type CourseRow as PlatRow, type SectionTuple,
} from "@/lib/plat";
import { useShortlist } from "@/components/plat/useShortlist";
import { useTheme } from "@/components/plat/theme";
import {
  courseRole, majorSubjects, platRowToCourse, rowToTimes, ROLE_STYLES,
  type CourseRole, type RoleContext,
} from "@/lib/plannerBridge";
import {
  CODE, autoPick, buildEvents, busyFrom, eventsForRow, findFamily, forcedSelection,
  groupSections, isComplete, meetingsOfRows, missingParts, selectedSections,
  type CalEvent, type EventSource, type SectionSelection,
} from "@/lib/sections";

/**
 * The planner's own `CourseTime` uses 24-hour "09:30"; the schedule snapshot
 * uses "9:30a" and is parsed by plat.ts. Both end up as minutes past midnight.
 */
function clockToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

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

/** How far along a course's section choice is, for the rail to report. */
export interface SectionStatus {
  /** The term's schedule publishes sections for this course. */
  available: boolean;
  /** Still loading the subject file. */
  loading: boolean;
  /** A lecture family has been chosen. */
  started: boolean;
  /** Every required sub-section has a pick. */
  complete: boolean;
  /** "discussion", "lab" — what is still outstanding. */
  missing: string[];
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
  /** Chosen sections per course: { "CSE 11": { family: "A", parts: { DI: "A01" } } } */
  sections: Record<string, SectionSelection>;
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

  /** Real per-section rows, lazily fetched per subject. */
  sectionsByCode: Record<string, SectionTuple[]>;
  /** Each scheduled course's TSS booking link, from the same subject files. */
  tssByCode: Record<string, string | null>;
  selections: Record<string, SectionSelection>;
  setSelection: (code: string, next: SectionSelection) => void;
  clearSelection: (code: string) => void;
  /** Commit an option clicked on the calendar or the map. */
  chooseOption: (code: string, choice: NonNullable<CalEvent["choice"]>) => void;
  /** Adds a course straight from its code — the rail's quick-add box. */
  addCourseByCode: (code: string) => boolean;
  platByCode: Map<string, PlatRow>;
  /** This term, "FA26", as the dataset names it. */
  term: string;
  /** Building code -> name and UCSD's coordinates, for the campus map. */
  buildings: Record<string, Building>;
  /**
   * Lecture choices still open, as clickable ghost blocks. A course with more
   * than one lecture used to sit on the calendar at its catalog time, labelled
   * "Meeting" — a time that belonged to one lecture, shown as if decided.
   */
  optionEvents: CalEvent[];
  /** Fill in sections that fit around everything already placed. */
  autoPickFor: (code: string) => boolean;
  autoPickAll: () => void;
  sectionStatus: (code: string) => SectionStatus;
  /** Every block the calendar draws, conflicts already marked. */
  events: CalEvent[];
  conflictCodes: Set<string>;
  totalUnits: number;

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
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [platRows, setPlatRows] = useState<PlatRow[]>([]);
  const [term, setTerm] = useState("");
  const [buildings, setBuildings] = useState<Record<string, Building>>({});
  const [sectionsByCode, setSectionsByCode] = useState<Record<string, SectionTuple[]>>({});
  const [tssByCode, setTssByCode] = useState<Record<string, string | null>>({});
  const [loadingSubjects, setLoadingSubjects] = useState<Set<string>>(() => new Set());
  const [selections, setSelections] = useState<Record<string, SectionSelection>>({});

  const { codes: savedCodes, toggle: toggleSaved } = useShortlist();
  const majorSubjectSet = useMemo(() => majorSubjects(selectedMajor), [selectedMajor]);

  useEffect(() => {
    loadIndex()
      .then((d) => {
        setPlatRows(d.courses);
        setTerm(d.meta.term);
      })
      .catch(() => {});
    // Ten kilobytes, and the map is useless without it; a failure only means
    // every meeting is listed as "not on the map" rather than pinned.
    loadBuildings().then((f) => setBuildings(f.buildings)).catch(() => {});
  }, []);

  // ── Rehydrate ───────────────────────────────────────────────────────────────
  // Read after mount, not in useState, so the server and first client render
  // agree. `hydrated` gates the writer below so an empty first render cannot
  // wipe a stored plan.
  const syncedRef = useRef<Set<string>>(new Set());
  /** Subjects whose section file has been requested, so each is fetched once. */
  const loadedSubjects = useRef<Set<string>>(new Set());
  /**
   * Guards state writes from in-flight fetches after the planner unmounts.
   *
   * The setup line is load-bearing: Strict Mode mounts, unmounts and remounts,
   * and a cleanup-only effect left this false for the rest of the session, so
   * every section fetch resolved into a discarded result.
   */
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
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
      if (saved.sections && typeof saved.sections === "object") setSelections(saved.sections);
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
      sections: selections,
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {}
  }, [
    hydrated, selectedMajor, selectedMinor, selectedCollege,
    selectedCourses, plannedCourses, selections,
  ]);

  // ── Section data ────────────────────────────────────────────────────────────
  // Sections live in the per-subject files, not the index, so they are fetched
  // only for subjects actually on the schedule. plat.ts memoizes each file, so
  // adding a second CSE course costs nothing.

  useEffect(() => {
    const wanted = new Set<string>();
    for (const { course } of selectedCourses) {
      const subject = course.departments?.[0] ?? course.code.split(" ")[0];
      if (subject && !loadedSubjects.current.has(subject)) wanted.add(subject);
    }
    if (!wanted.size) return;

    for (const subject of wanted) loadedSubjects.current.add(subject);
    setLoadingSubjects((prev) => new Set([...prev, ...wanted]));

    Promise.all(
      [...wanted].map((subject) =>
        loadSubject(subject)
          .then((file) => {
            const rows: Record<string, SectionTuple[]> = {};
            const tss: Record<string, string | null> = {};
            for (const [code, detail] of Object.entries(file.courses)) {
              if (detail.sec?.length) rows[code] = detail.sec;
              if (detail.tss) tss[code] = detail.tss;
            }
            return { rows, tss };
          })
          // A missing subject file is a gap in the snapshot, not a broken page:
          // the course keeps its catalog meeting time and simply cannot be
          // broken down into sections.
          .catch(() => ({ rows: {}, tss: {} })),
      ),
    ).then((results) => {
      if (!mounted.current) return;
      setSectionsByCode((prev) => Object.assign({}, prev, ...results.map((r) => r.rows)));
      setTssByCode((prev) => Object.assign({}, prev, ...results.map((r) => r.tss)));
      setLoadingSubjects((prev) => {
        const next = new Set(prev);
        for (const subject of wanted) next.delete(subject);
        return next;
      });
    });
    // Deliberately no cleanup that cancels this. Adding a second course re-runs
    // the effect, and a per-run cancel flag killed the only fetch in flight —
    // while `loadedSubjects` had already marked the subject as requested, so
    // nothing ever retried and the rail sat on "Loading sections…" forever.
    // Results are merged by course code, so a late arrival is simply correct.
  }, [selectedCourses]);

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

  // ── What a course counts toward ─────────────────────────────────────────────
  // Defined before the calendar because every block is coloured by its role.

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

  // ── Calendar events ─────────────────────────────────────────────────────────
  // The week is derived, never stored. A course contributes its chosen sections
  // when the schedule publishes them. Only a course with no section rows at all
  // — its subject file still loading, or missing — falls back to the meeting
  // time in the catalog index, and only when that time is real: the placeholder
  // times this used to invent put courses on the calendar at hours they never
  // meet, labelled "Meeting".

  const events = useMemo((): CalEvent[] => {
    const sources: EventSource[] = selectedCourses.map(({ course }) => {
      const sec = sectionsByCode[course.code] ?? [];
      const chosen = sec.length
        ? selectedSections(groupSections(sec), selections[course.code])
        : [];
      const row = platByCode.get(course.code);
      return {
        code: course.code,
        title: course.title,
        role: courseRole(course, roleContext),
        sections: chosen,
        fallback: sec.length || !row?.o
          ? []
          : (rowToTimes(row) ?? []).flatMap((t) => {
              const startMin = clockToMinutes(t.start);
              const endMin = clockToMinutes(t.end);
              return startMin == null || endMin == null
                ? []
                : [{ day: t.day, startMin, endMin }];
            }),
        fallbackWhere: row?.b ?? "",
      };
    });
    return buildEvents(sources);
  }, [selectedCourses, sectionsByCode, selections, roleContext, platByCode]);

  const optionEvents = useMemo((): CalEvent[] => {
    const out: CalEvent[] = [];
    for (const { course } of selectedCourses) {
      const sec = sectionsByCode[course.code];
      if (!sec?.length) continue;
      const families = groupSections(sec);
      if (findFamily(families, selections[course.code]?.family)) continue;
      const src = { code: course.code, title: course.title, role: courseRole(course, roleContext) };
      for (const f of families) {
        if (f.lectureRows.length) {
          for (const r of f.lectureRows) {
            out.push(...eventsForRow(src, r, {
              ghost: "option",
              choice: { family: f.key, part: null, code: r[CODE] },
            }));
          }
          continue;
        }
        // A family with no lecture (a lab-only course) is chosen by its parts.
        for (const p of f.parts) {
          for (const s of p.sections) {
            for (const r of p.rows[s[CODE]] ?? [s]) {
              out.push(...eventsForRow(src, r, {
                ghost: "option",
                choice: { family: f.key, part: p.type, code: s[CODE] },
              }));
            }
          }
        }
      }
    }
    return out;
  }, [selectedCourses, sectionsByCode, selections, roleContext]);

  /**
   * Makes the choices that are not really choices — the only lecture on offer,
   * a discussion with one option — as soon as a course's sections arrive, so
   * the week shows "Lecture A00" instead of waiting for a click that decides
   * nothing. A course with two or more lectures is left alone: that is a
   * decision about someone's week, and guessing it would be wrong half the time.
   */
  useEffect(() => {
    if (!hydrated) return;
    const additions: Record<string, SectionSelection> = {};
    for (const { course } of selectedCourses) {
      const sec = sectionsByCode[course.code];
      if (!sec?.length) continue;
      const families = groupSections(sec);
      const forced = forcedSelection(families);
      if (!forced) continue;
      const current = selections[course.code];
      if (!current || !findFamily(families, current.family)) {
        additions[course.code] = forced;
        continue;
      }
      if (current.family !== forced.family) continue;
      const missing = Object.entries(forced.parts).filter(([type]) => !current.parts[type]);
      if (missing.length) {
        additions[course.code] = { ...current, parts: { ...current.parts, ...Object.fromEntries(missing) } };
      }
    }
    if (Object.keys(additions).length) setSelections((prev) => ({ ...prev, ...additions }));
  }, [hydrated, selectedCourses, sectionsByCode, selections]);

  const conflictCodes = useMemo(
    () => new Set(events.filter((e) => e.conflict).map((e) => e.code)),
    [events],
  );

  const totalUnits = useMemo(
    () => selectedCourses.reduce((sum, sc) => sum + sc.course.units, 0),
    [selectedCourses],
  );

  // ── Section actions ─────────────────────────────────────────────────────────

  const setSelection = useCallback((code: string, next: SectionSelection) => {
    setSelections((prev) => ({ ...prev, [code]: next }));
  }, []);

  const clearSelection = useCallback((code: string) => {
    setSelections((prev) => {
      if (!(code in prev)) return prev;
      const next = { ...prev };
      delete next[code];
      return next;
    });
  }, []);

  /**
   * An option clicked on the calendar. Choosing a lecture keeps nothing from a
   * different family, because a discussion belongs to its lecture; choosing a
   * sub-section implies its family, so a lab-only course needs one click.
   */
  const chooseOption = useCallback(
    (code: string, choice: NonNullable<CalEvent["choice"]>) => {
      setSelections((prev) => {
        const cur = prev[code];
        let base: SectionSelection;
        if (cur && cur.family === choice.family) {
          base = cur;
        } else {
          // A new lecture brings any sub-section it has only one of, as the
          // rail does — a lone discussion is not a second decision.
          const family = findFamily(groupSections(sectionsByCode[code] ?? []), choice.family);
          const parts: Record<string, string> = {};
          for (const p of family?.parts ?? []) {
            if (p.sections.length === 1) parts[p.type] = p.sections[0][CODE];
          }
          base = { family: choice.family, parts };
        }
        const next = choice.part
          ? { ...base, parts: { ...base.parts, [choice.part]: choice.code } }
          : base;
        return { ...prev, [code]: next };
      });
    },
    [sectionsByCode],
  );

  const sectionStatus = useCallback(
    (code: string): SectionStatus => {
      const sec = sectionsByCode[code];
      const subject = code.split(" ")[0];
      if (!sec?.length) {
        return {
          available: false,
          loading: loadingSubjects.has(subject),
          started: false,
          complete: false,
          missing: [],
        };
      }
      const families = groupSections(sec);
      const sel = selections[code];
      return {
        available: families.length > 0,
        loading: false,
        // A stored pick naming a lecture that no longer exists is no pick.
        started: Boolean(findFamily(families, sel?.family)),
        complete: isComplete(families, sel),
        missing: missingParts(families, sel),
      };
    },
    [sectionsByCode, selections, loadingSubjects],
  );

  /**
   * Fills one course's sections around everything already on the calendar.
   * Blocks belonging to this course are excluded from "busy" so re-running it
   * does not treat the course's own current pick as an obstacle.
   */
  const autoPickFor = useCallback(
    (code: string) => {
      const sec = sectionsByCode[code];
      if (!sec?.length) return false;
      const busy = busyFrom(events.filter((e) => e.code !== code));
      const picked = autoPick(sec, busy);
      if (!picked) return false;
      setSelections((prev) => ({ ...prev, [code]: picked }));
      return true;
    },
    [sectionsByCode, events],
  );

  /**
   * The whole term at once. Courses are filled in order, each planning around
   * the ones already settled, which is why this runs on a local accumulator
   * rather than calling autoPickFor in a loop against stale state.
   */
  const autoPickAll = useCallback(() => {
    const busy = busyFrom(
      events.filter((e) => !sectionsByCode[e.code]?.length),
    );
    const next: Record<string, SectionSelection> = {};

    for (const { course } of selectedCourses) {
      const sec = sectionsByCode[course.code];
      if (!sec?.length) continue;
      const picked = autoPick(sec, busy);
      if (!picked) continue;
      next[course.code] = picked;
      busy.push(...meetingsOfRows(selectedSections(groupSections(sec), picked)));
    }

    if (Object.keys(next).length) setSelections((prev) => ({ ...prev, ...next }));
  }, [selectedCourses, sectionsByCode, events]);

  // ── Schedule actions ────────────────────────────────────────────────────────

  const addToSchedule = useCallback((course: Course) => {
    // Functional update: reading `selectedCourses` from the render closure meant
    // two adds in the same tick silently dropped one.
    setSelectedCourses((prev) => {
      if (prev.some((c) => c.course.id === course.id)) return prev;
      // No placeholder time: a course with no published time stays off the
      // grid and says so in the rail, rather than appearing at an invented hour.
      return [...prev, { course, id: `${course.id}-${Date.now()}-${prev.length}` }];
    });
  }, []);

  const addCourseByCode = useCallback(
    (code: string) => {
      const row = platByCode.get(code);
      if (!row) return false;
      addToSchedule(platRowToCourse(row, majorSubjectSet));
      return true;
    },
    [platByCode, majorSubjectSet, addToSchedule],
  );

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
    selectedCourses, addToSchedule, removeFromSchedule, clearSchedule,
    sectionsByCode, tssByCode, selections, setSelection, clearSelection, chooseOption,
    addCourseByCode, platByCode, term, buildings, optionEvents,
    autoPickFor, autoPickAll, sectionStatus, events, conflictCodes, totalUnits,
    plannedCourses, addAICourseToPlan, removePlannedCourse, addToPlanner, movePlannedCourse,
    plannerYear, setPlannerYear, plannerQuarter, setPlannerQuarter,
    isGeneratingPlan, planError, generateFourYearPlan,
    roleOf, getColorForCourse, activeRequirements, degreeProgress,
  };

  return <PlannerCtx.Provider value={value}>{children}</PlannerCtx.Provider>;
}

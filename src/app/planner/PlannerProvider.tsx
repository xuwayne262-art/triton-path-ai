"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import type { DropResult } from "@hello-pangea/dnd";
import {
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
  HttpError, loadBuildings, loadIndex, loadSubject, tidyTitle,
  type Building, type CourseRow as PlatRow, type SectionTuple,
} from "@/lib/plat";
import { useShortlist } from "@/components/plat/useShortlist";
import { useTheme } from "@/components/plat/theme";
import {
  completedCourses, courseRole, majorSubjects, platRowToCourse, rowToTimes, ROLE_STYLES,
  type CourseRole, type RoleContext,
} from "@/lib/plannerBridge";
import {
  CODE, autoPick, buildEvents, busyFrom, eventsForRow, findFamily, fitAll, forcedSelection,
  groupSections, isComplete, missingParts, selectedSections,
  type CalEvent, type EventSource, type SectionSelection,
} from "@/lib/sections";
import {
  cleanPlanner, DEFAULT_MAJOR, DEFAULT_MINOR,
  type PastTerm, type PlannedCourse, type PlannerDoc, type PlanQuarter, type PlanYear, type ScheduleCourse,
} from "@/lib/plan/record";
import { inTerm, LEGACY_TERM, termRank } from "@/lib/plan/term";
import {
  noteLocalChange, PLANNER_EVENT, PLANNER_KEY, useAccountSync, type SyncStatus,
} from "@/lib/plan/sync";
import { currentPlanSlot } from "@/lib/planSlot";
import { programLabel } from "@/data/ucsdMajorsMinors";
import type { ParsedHistory } from "@/lib/history/parse";

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

// The stored shapes are defined with the rest of the synced plan.
export type { ScheduleCourse, PlannedCourse };
export type Year = PlanYear;
export type Quarter = PlanQuarter;

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
  /**
   * The subject file could not be fetched — a dropped connection, not an
   * answer. Told apart from "no sections published", which it used to be
   * reported as.
   */
  failed: boolean;
  /** A lecture family has been chosen. */
  started: boolean;
  /** Every required sub-section has a pick. */
  complete: boolean;
  /** "discussion", "lab" — what is still outstanding. */
  missing: string[];
}

/** What "Fit my sections" did, so the page can say so and offer to undo it. */
export interface FitReport {
  /** Courses whose sections changed. */
  changed: string[];
  /** Courses nothing could be fitted for; their picks were left alone. */
  failed: string[];
  /** The changed courses' selections before, for undo; undefined means none was made. */
  before: Record<string, SectionSelection | undefined>;
}

/**
 * The saved Academic History, as degree progress sees it: still loading, none
 * saved yet, saved (its completed courses count), or it could not be loaded.
 */
export type HistoryStatus = "loading" | "none" | "saved" | "failed";

export interface DegreeProgressGroup {
  id: string;
  groupLabel: string;
  color: string;
  requirements: Array<{
    category: string;
    label: string;
    targetUnits: number;
    /** Units counted toward it: completed, planned and on this term's schedule. */
    current: number;
    /** Of those, the units the saved Academic History shows completed. */
    done: number;
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

// ── Persistence ────────────────────────────────────────────────────────────────
// The plan is stored in this browser and kept with the student's account; the
// sync in lib/plan/sync.ts moves it between the two. This provider only reads
// and writes the local copy, and hears from the sync when a copy saved on
// another device has replaced it.

/** The stored plan, cleaned — localStorage is editable and outlives deploys. */
function readPersisted(): PlannerDoc | null {
  try {
    return cleanPlanner(JSON.parse(localStorage.getItem(PLANNER_KEY) ?? "null"));
  } catch {
    return null;
  }
}

// ── Context ────────────────────────────────────────────────────────────────────

interface PlannerValue {
  darkMode: boolean;
  toggleDarkMode: () => void;
  /** Whether the plan on screen is saved to the student's account. */
  syncStatus: SyncStatus;

  selectedMajor: string;
  setSelectedMajor: (m: string) => void;
  selectedMinor: string;
  setSelectedMinor: (m: string) => void;
  selectedCollege: College | null;
  setSelectedCollege: (c: College | null) => void;

  searchQuery: string;
  setSearchQuery: (q: string) => void;
  platRows: PlatRow[];
  savedCourses: Array<{ course: Course; row: PlatRow }>;
  toggleSaved: (code: string) => void;

  selectedCourses: ScheduleCourse[];
  addToSchedule: (course: Course) => void;
  removeFromSchedule: (id: string) => void;
  clearSchedule: () => void;
  /**
   * Undo for a removal: puts the schedule back as it was in `snapshot`, keeping
   * anything added since. Section picks were never dropped, so they come back
   * with their courses.
   */
  restoreSchedule: (snapshot: ScheduleCourse[]) => void;

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
  /**
   * The plan and this page are the same term's, so a course may be added and
   * its sections picked. Until then a term's picks may still be moving to
   * pastTerms, and anything added would be filed under the old term.
   */
  termSettled: boolean;
  /** This term, "FA26", as the dataset names it. */
  term: string;
  /** "Fall 2026", or "" until the dataset has loaded. */
  termName: string;
  /** Earlier terms' schedules, put away when the dataset moved on (see lib/plan/term.ts). */
  pastTerms: Record<string, PastTerm>;
  /**
   * The term the plan has moved on to, when this page loaded an older term's
   * schedule — a tab left open across the switch. The planner neither picks
   * nor saves until it is reloaded, so the newer plan cannot be overwritten.
   */
  newerPlanTerm: string | null;
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
  /** Fits every course, keeping the picks that already fit; says what it did. */
  autoPickAll: () => FitReport;
  /** Undo for autoPickAll: puts the listed courses' selections back as they were. */
  restoreSelections: (before: Record<string, SectionSelection | undefined>) => void;
  /** Asks again for section files that failed to load. */
  retrySections: () => void;
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
  /**
   * What degree progress counts, each course once: the courses the saved
   * Academic History shows completed, the four-year plan, and this term.
   */
  progressCourses: Course[];
  historyStatus: HistoryStatus;
  /** Completed courses the saved Academic History added to progress. */
  completedCount: number;
  /** Asks again for an Academic History that failed to load. */
  retryHistory: () => void;
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
  const syncStatus = useAccountSync();

  const [selectedMajor, setSelectedMajor] = useState<string>(DEFAULT_MAJOR);
  const [selectedMinor, setSelectedMinor] = useState<string>(DEFAULT_MINOR);
  const [selectedCollege, setSelectedCollege] = useState<College | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourses, setSelectedCourses] = useState<ScheduleCourse[]>([]);
  const [plannedCourses, setPlannedCourses] = useState<PlannedCourse[]>([]);
  // What the student picked for "Add from this term"; until they pick, the
  // pickers follow where this term is in their plan (see `plannerYear`).
  const [chosenYear, setPlannerYear] = useState<Year | null>(null);
  const [chosenQuarter, setPlannerQuarter] = useState<Quarter | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [platRows, setPlatRows] = useState<PlatRow[]>([]);
  const [term, setTerm] = useState("");
  const [termName, setTermName] = useState("");
  const [buildings, setBuildings] = useState<Record<string, Building>>({});
  const [sectionsByCode, setSectionsByCode] = useState<Record<string, SectionTuple[]>>({});
  const [tssByCode, setTssByCode] = useState<Record<string, string | null>>({});
  const [loadingSubjects, setLoadingSubjects] = useState<Set<string>>(() => new Set());
  /** Subjects whose file could not be fetched, until "Try again" asks once more. */
  const [failedSubjects, setFailedSubjects] = useState<Set<string>>(() => new Set());
  /** Bumped by retrySections, so the fetch below runs again for the subjects it cleared. */
  const [retryTick, setRetryTick] = useState(0);
  const [selections, setSelections] = useState<Record<string, SectionSelection>>({});
  /** The term `selectedCourses` and `selections` were picked from; undefined on a plan saved before terms were recorded. */
  const [planTerm, setPlanTerm] = useState<string | undefined>(undefined);
  const [pastTerms, setPastTerms] = useState<Record<string, PastTerm>>({});

  const { codes: savedCodes, toggle: toggleSaved } = useShortlist();
  const majorSubjectSet = useMemo(() => majorSubjects(selectedMajor), [selectedMajor]);

  useEffect(() => {
    loadIndex()
      .then((d) => {
        setPlatRows(d.courses);
        setTerm(d.meta.term);
        setTermName(d.meta.termName);
      })
      .catch(() => {});
    // Ten kilobytes, and the map is useless without it; a failure only means
    // every meeting is listed as "not on the map" rather than pinned.
    loadBuildings().then((f) => setBuildings(f.buildings)).catch(() => {});
  }, []);

  // ── The saved Academic History ──────────────────────────────────────────────
  // Its completed courses count toward degree progress, which otherwise showed
  // zeros to a student three years in, however much they had imported on
  // /import. Read once per visit to the planner; saved and changed on /import.
  const [history, setHistory] = useState<ParsedHistory | null>(null);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>("loading");
  const [historyTick, setHistoryTick] = useState(0);
  useEffect(() => {
    let live = true;
    fetch("/api/history", { cache: "no-store" })
      .then(async (res) => {
        if (!live) return;
        // Nothing saved yet: the common case, and not a failure.
        if (res.status === 204) {
          setHistory(null);
          setHistoryStatus("none");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const record = (await res.json()) as ParsedHistory;
        if (!live) return;
        setHistory(record);
        setHistoryStatus("saved");
      })
      // One that could not be read is not one that does not exist: progress
      // says it is missing rather than inviting a second import.
      .catch(() => { if (live) setHistoryStatus("failed"); });
    return () => { live = false; };
  }, [historyTick]);
  const retryHistory = useCallback(() => {
    setHistoryStatus("loading");
    setHistoryTick((n) => n + 1);
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
    /** Puts a stored plan on screen; with none, the untouched defaults. */
    const apply = (saved: PlannerDoc | null) => {
      setSelectedMajor(saved?.major ?? DEFAULT_MAJOR);
      setSelectedMinor(saved?.minor ?? DEFAULT_MINOR);
      setSelectedCollege(saved?.college ?? null);
      setSelectedCourses(saved?.schedule ?? []);
      setPlannedCourses(saved?.planned ?? []);
      syncedRef.current = new Set(saved?.synced ?? []);
      setSelections(saved?.sections ?? {});
      setPlanTerm(saved?.term);
      setPastTerms(saved?.past ?? {});
    };
    const saved = readPersisted();
    if (saved) apply(saved);
    setHydrated(true);

    // The account's copy replaced this browser's: another device's edits
    // arrived, or this browser last held someone else's plan.
    const onSynced = () => apply(readPersisted());
    window.addEventListener(PLANNER_EVENT, onSynced);
    return () => window.removeEventListener(PLANNER_EVENT, onSynced);
  }, []);

  // ── Which term the picks belong to ──────────────────────────────────────────
  /**
   * The term the plan has moved on to, when this page loaded an older term's
   * schedule: a tab opened before the dataset switched, holding a plan another
   * device has since moved. Its section files cannot answer for that term's
   * picks, so nothing here picks or saves until the page is reloaded.
   */
  const newerPlanTerm = hydrated && term && planTerm && termRank(planTerm) > termRank(term) ? planTerm : null;
  /** The picks and this page's schedule are the same term's; until then nothing is picked or added on its own. */
  const termSettled = hydrated && !!term && planTerm === term;

  // When the dataset has moved on to a later term since this plan was saved,
  // the earlier term's picks are put away under it (lib/plan/term.ts) rather
  // than read against the new term's sections, where "A01" is a different
  // section. A plan saved before terms were recorded is stamped with its term.
  useEffect(() => {
    if (!hydrated || !term) return;
    const from = planTerm || LEGACY_TERM;
    if (from === term) {
      if (planTerm !== term) setPlanTerm(term);
      return;
    }
    // The plan is ahead of this page (newerPlanTerm): never move it back.
    if (termRank(term) < termRank(from)) return;
    const moved = inTerm({
      major: selectedMajor, minor: selectedMinor, college: selectedCollege,
      schedule: selectedCourses, planned: plannedCourses, synced: [...syncedRef.current],
      sections: selections, term: planTerm, past: pastTerms,
    }, term);
    setSelectedCourses(moved.schedule);
    setSelections(moved.sections);
    setPastTerms(moved.past ?? {});
    setPlanTerm(moved.term);
  }, [
    hydrated, term, planTerm, pastTerms, selectedMajor, selectedMinor, selectedCollege,
    selectedCourses, plannedCourses, selections,
  ]);

  useEffect(() => {
    if (!hydrated || newerPlanTerm) return;
    const payload: PlannerDoc = {
      major: selectedMajor,
      minor: selectedMinor,
      college: selectedCollege,
      schedule: selectedCourses,
      planned: plannedCourses,
      synced: [...syncedRef.current],
      sections: selections,
      ...(planTerm ? { term: planTerm } : {}),
      ...(Object.keys(pastTerms).length ? { past: pastTerms } : {}),
    };
    try { localStorage.setItem(PLANNER_KEY, JSON.stringify(payload)); } catch {}
    noteLocalChange();
  }, [
    hydrated, newerPlanTerm, selectedMajor, selectedMinor, selectedCollege,
    selectedCourses, plannedCourses, selections, planTerm, pastTerms,
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
            return { subject, rows, tss, failed: false };
          })
          // A subject with no file this term is a gap in the snapshot, not a
          // broken page: the course keeps its catalog meeting time and simply
          // cannot be broken down into sections. Anything else — a dropped
          // connection, an expired session — is not an answer about the course,
          // and used to be reported as "No sections published this term".
          .catch((err: unknown) => ({
            subject,
            rows: {},
            tss: {},
            failed: !(err instanceof HttpError && err.status === 404),
          })),
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
      const failed = results.filter((r) => r.failed).map((r) => r.subject);
      if (failed.length) setFailedSubjects((prev) => new Set([...prev, ...failed]));
    });
    // Deliberately no cleanup that cancels this. Adding a second course re-runs
    // the effect, and a per-run cancel flag killed the only fetch in flight —
    // while `loadedSubjects` had already marked the subject as requested, so
    // nothing ever retried and the rail sat on "Loading sections…" forever.
    // Results are merged by course code, so a late arrival is simply correct.
  }, [selectedCourses, retryTick]);

  const retrySections = useCallback(() => {
    // Forgetting that they were requested is what lets the effect above ask again.
    for (const subject of failedSubjects) loadedSubjects.current.delete(subject);
    setFailedSubjects(new Set());
    setRetryTick((n) => n + 1);
  }, [failedSubjects]);

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

  /**
   * A course's requirement categories as they stand for the program chosen now.
   * A stored course keeps the categories it was given when it was added — its GE
   * areas, plus "Lower/Upper Division" if its subject belonged to the major then
   * — so after switching from Computer Science to Mathematics, CSE courses went
   * on counting toward Mathematics' division requirements.
   */
  const currentCategories = useCallback(
    (course: Course): Course["categories"] => {
      const row = platByCode.get(course.code);
      return row ? platRowToCourse(row, majorSubjectSet).categories : course.categories;
    },
    [platByCode, majorSubjectSet],
  );

  const roleOf = useCallback(
    (course: Course): CourseRole =>
      courseRole({ ...course, categories: currentCategories(course) }, roleContext),
    [roleContext, currentCategories],
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
        title: tidyTitle(course.title),
        role: roleOf(course),
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
  }, [selectedCourses, sectionsByCode, selections, roleOf, platByCode]);

  const optionEvents = useMemo((): CalEvent[] => {
    const out: CalEvent[] = [];
    for (const { course } of selectedCourses) {
      const sec = sectionsByCode[course.code];
      if (!sec?.length) continue;
      const families = groupSections(sec);
      if (findFamily(families, selections[course.code]?.family)) continue;
      const src = { code: course.code, title: tidyTitle(course.title), role: roleOf(course) };
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
  }, [selectedCourses, sectionsByCode, selections, roleOf]);

  /**
   * Makes the choices that are not really choices — the only lecture on offer,
   * a discussion with one option — as soon as a course's sections arrive, so
   * the week shows "Lecture A00" instead of waiting for a click that decides
   * nothing. A course with two or more lectures is left alone: that is a
   * decision about someone's week, and guessing it would be wrong half the time.
   */
  useEffect(() => {
    if (!termSettled) return;
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
  }, [termSettled, selectedCourses, sectionsByCode, selections]);

  const conflictCodes = useMemo(
    () => new Set(events.filter((e) => e.conflict).map((e) => e.code)),
    [events],
  );

  const totalUnits = useMemo(
    () => selectedCourses.reduce((sum, sc) => sum + sc.course.units, 0),
    [selectedCourses],
  );

  /**
   * The schedule as the pages show it. A title saved before the catalog's em
   * dashes were spaced (see tidyTitle) shows spaced too, without rewriting the
   * saved plan.
   */
  const shownSchedule = useMemo(
    () => selectedCourses.map((sc) => {
      const title = tidyTitle(sc.course.title);
      return title === sc.course.title ? sc : { ...sc, course: { ...sc.course, title } };
    }),
    [selectedCourses],
  );

  // ── Where this term is in the four-year plan ────────────────────────────────
  // The Year and Quarter pickers opened on Year 1, Fall for everyone, so a
  // junior had to move both before adding this term. They now open on this
  // term's quarter and the year the plan puts it in, until the student picks.
  const currentSlot = useMemo(
    () => (hydrated ? currentPlanSlot(term, plannedCourses, selectedCourses.map((sc) => sc.course.code)) : null),
    [hydrated, term, plannedCourses, selectedCourses],
  );
  const plannerYear: Year = chosenYear ?? currentSlot?.year ?? 1;
  const plannerQuarter: Quarter = chosenQuarter ?? currentSlot?.quarter ?? "Fall";

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
      const course = selectedCourses.find((sc) => sc.course.code === code)?.course;
      // Keyed the way the loader above keys its requests.
      const subject = course?.departments?.[0] ?? code.split(" ")[0];
      if (!sec?.length) {
        return {
          available: false,
          loading: loadingSubjects.has(subject),
          failed: failedSubjects.has(subject),
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
        failed: false,
        // A stored pick naming a lecture that no longer exists is no pick.
        started: Boolean(findFamily(families, sel?.family)),
        complete: isComplete(families, sel),
        missing: missingParts(families, sel),
      };
    },
    [sectionsByCode, selections, loadingSubjects, failedSubjects, selectedCourses],
  );

  /**
   * Fills one course's sections around everything already on the calendar.
   * Blocks belonging to this course are excluded from "busy" so re-running it
   * does not treat the course's own current pick as an obstacle — but that
   * pick is tried first, so a chosen lecture stays if a discussion fits it.
   */
  const autoPickFor = useCallback(
    (code: string) => {
      const sec = sectionsByCode[code];
      if (!sec?.length) return false;
      const busy = busyFrom(events.filter((e) => e.code !== code));
      const picked = autoPick(sec, busy, selections[code]);
      if (!picked) return false;
      setSelections((prev) => ({ ...prev, [code]: picked }));
      return true;
    },
    [sectionsByCode, events, selections],
  );

  /**
   * The whole term at once (see fitAll): what already fits stays, and the rest
   * is fitted around it, each course planning around the ones settled before
   * it. Courses with no section data keep their catalog time as fixed.
   */
  const autoPickAll = useCallback((): FitReport => {
    const fixed = busyFrom(events.filter((e) => !sectionsByCode[e.code]?.length));
    const { picks, failed } = fitAll(
      selectedCourses
        .filter(({ course }) => sectionsByCode[course.code]?.length)
        .map(({ course }) => ({
          code: course.code,
          sec: sectionsByCode[course.code],
          selection: selections[course.code],
        })),
      fixed,
    );
    const changed = Object.keys(picks);
    if (changed.length) setSelections((prev) => ({ ...prev, ...picks }));
    return {
      changed,
      failed,
      before: Object.fromEntries(changed.map((code) => [code, selections[code]])),
    };
  }, [selectedCourses, sectionsByCode, events, selections]);

  const restoreSelections = useCallback((before: Record<string, SectionSelection | undefined>) => {
    setSelections((prev) => {
      const next = { ...prev };
      for (const [code, sel] of Object.entries(before)) {
        if (sel) next[code] = sel;
        else delete next[code];
      }
      return next;
    });
  }, []);

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

  const restoreSchedule = useCallback((snapshot: ScheduleCourse[]) => {
    setSelectedCourses((prev) => {
      const inSnapshot = new Set(snapshot.map((e) => e.id));
      const codes = new Set(snapshot.map((e) => e.course.code));
      return [...snapshot, ...prev.filter((e) => !inSnapshot.has(e.id) && !codes.has(e.course.code))];
    });
  }, []);

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
    if (!termSettled) return;
    const pending = savedCourses.filter(({ course }) => !syncedRef.current.has(course.code));
    if (!pending.length) return;
    for (const { course } of pending) {
      syncedRef.current.add(course.code);
      addToSchedule(course);
    }
  }, [termSettled, savedCourses, addToSchedule]);

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
      // By code, so a course already somewhere in the plan is never planned twice.
      const have = new Set(prev.map((pc) => pc.course.code));
      const additions = selectedCourses
        .filter((sc) => !have.has(sc.course.code))
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

  /** What the saved Academic History shows completed (see completedCourses). */
  const doneCourses = useMemo(
    () => completedCourses(history, (code) => platByCode.get(code), majorSubjectSet),
    [history, platByCode, majorSubjectSet],
  );

  /**
   * The courses degree progress counts, each once: what the saved Academic
   * History shows completed, everything in the four-year plan, and this term's
   * schedule. Completed courses go first, so one both taken and planned counts
   * with the units it earned. Progress used to count this term's schedule
   * alone, so a full four-year plan beside it showed almost nothing done.
   */
  const progressCourses = useMemo((): Course[] => {
    const byCode = new Map<string, Course>();
    for (const course of doneCourses) byCode.set(course.code, course);
    for (const { course } of plannedCourses) if (!byCode.has(course.code)) byCode.set(course.code, course);
    for (const { course } of selectedCourses) if (!byCode.has(course.code)) byCode.set(course.code, course);
    return [...byCode.values()];
  }, [doneCourses, plannedCourses, selectedCourses]);

  const degreeProgress = useMemo((): DegreeProgressGroup[] => {
    const tally: Record<string, number> = {};
    for (const course of progressCourses) {
      currentCategories(course)?.forEach((cat) => {
        if (cat in activeRequirements) tally[cat] = (tally[cat] ?? 0) + course.units;
      });
    }
    // Completed units apart from planned ones: a plan is not credit, and a bar
    // filled by plans alone used to turn green as if the requirement were met.
    const doneTally: Record<string, number> = {};
    for (const course of doneCourses) {
      currentCategories(course)?.forEach((cat) => {
        if (cat in activeRequirements) doneTally[cat] = (doneTally[cat] ?? 0) + course.units;
      });
    }

    const majorReqs = MAJOR_REQUIREMENTS[selectedMajor] ?? {};
    const groups: DegreeProgressGroup[] = [{
      id: "major",
      groupLabel: `Major: ${programLabel(selectedMajor)}`,
      color: "bg-blue-500",
      requirements: Object.entries(majorReqs).map(([cat, target]) => ({
        category: cat, label: cat, targetUnits: target, current: tally[cat] ?? 0, done: doneTally[cat] ?? 0,
      })),
    }];

    if (selectedCollege) {
      const cg = COLLEGE_REQUIREMENTS[selectedCollege];
      groups.push({
        ...cg,
        requirements: cg.requirements.map((req) => ({ ...req, current: tally[req.category] ?? 0, done: doneTally[req.category] ?? 0 })),
      });
    }

    if (selectedMinor !== "None") {
      const minorReqs = MINOR_REQUIREMENTS[selectedMinor] ?? {};
      groups.push({
        id: "minor",
        groupLabel: `Minor: ${programLabel(selectedMinor)}`,
        color: "bg-teal-500",
        requirements: Object.entries(minorReqs).map(([cat, target]) => ({
          category: cat, label: cat, targetUnits: target, current: tally[cat] ?? 0, done: doneTally[cat] ?? 0,
        })),
      });
    }

    return groups;
  }, [progressCourses, doneCourses, currentCategories, selectedCollege, selectedMajor, selectedMinor, activeRequirements]);

  const value: PlannerValue = {
    darkMode, toggleDarkMode, syncStatus,
    selectedMajor, setSelectedMajor,
    selectedMinor, setSelectedMinor,
    selectedCollege, setSelectedCollege,
    searchQuery, setSearchQuery,
    platRows, savedCourses, toggleSaved,
    selectedCourses: shownSchedule, addToSchedule, removeFromSchedule, clearSchedule, restoreSchedule,
    sectionsByCode, tssByCode, selections, setSelection, clearSelection, chooseOption,
    addCourseByCode, platByCode, termSettled, term, termName, pastTerms, newerPlanTerm, buildings, optionEvents,
    autoPickFor, autoPickAll, restoreSelections, retrySections,
    sectionStatus, events, conflictCodes, totalUnits,
    plannedCourses, addAICourseToPlan, removePlannedCourse, addToPlanner, movePlannedCourse,
    plannerYear, setPlannerYear, plannerQuarter, setPlannerQuarter,
    isGeneratingPlan, planError, generateFourYearPlan,
    roleOf, getColorForCourse, activeRequirements, degreeProgress, progressCourses,
    historyStatus, completedCount: doneCourses.length, retryHistory,
  };

  return <PlannerCtx.Provider value={value}>{children}</PlannerCtx.Provider>;
}

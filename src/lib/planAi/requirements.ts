import { CAMPUS, collegeName, type CourseRow, type GEFile } from "@/lib/plat";
import { majorSubjects } from "@/lib/plannerBridge";
import type { Check, RequirementRef, SourceRef } from "./types";
import {
  DISCIPLINE_NAMES, WARREN_SOURCE, WARREN_TRACKS, pofcCourseFit, programById, programSubjects, resolvePofc,
  type WarrenDiscipline, type WarrenProfile, type WarrenProgram,
} from "./warren";

/**
 * What a request's requirement goal means for this student, and what one
 * course can claim toward it — with the strength of each claim stated.
 *
 *  - University requirements (DEI, AHI) come from UCSD's own lists: a course
 *    on one is "on the official list", with the list's date.
 *  - College GE areas come from community-compiled lists, which may be
 *    incomplete: a course on one "may count".
 *  - Warren's programs are a rule, not a list: a department's course "can
 *    count under Warren's rule", to confirm with Warren Advising.
 *
 * None of these is a degree audit, and nothing here says one is.
 */

export type Goal =
  | { kind: "warren"; program: WarrenProgram; discipline: WarrenDiscipline; profile: WarrenProfile }
  | { kind: "area"; college: string; areas: string[] }
  | { kind: "university"; list: "campus:DEI" | "campus:AHI" }
  | { kind: "subjects"; subjects: string[]; label: string };

/** A question with its answers, each of which is a goal (or another step). */
export interface GoalQuestion {
  id: "pofc-discipline" | "pofc-program" | "college" | "area";
  text: string;
  options: { label: string; ref: RequirementRef; college?: string }[];
  /** Options shown under "More". */
  more?: { label: string; ref: RequirementRef }[];
  note?: string;
}

export type GoalResolution =
  | { kind: "goal"; goal: Goal; notes: string[] }
  | { kind: "ask"; question: GoalQuestion; notes?: string[] }
  | { kind: "blocked"; text: string; question: GoalQuestion | null }
  | { kind: "listed-elsewhere"; program: WarrenProgram; text: string };

const UNIVERSITY_NAMES: Record<string, string> = {
  "campus:DEI": "Diversity, Equity & Inclusion (DEI)",
  "campus:AHI": "American History & Institutions (AHI)",
};

/** A goal as the words before "courses": "Economics Area Study", "Sixth College Humanities GE", "DEI". */
export function goalNoun(goal: Goal): string {
  switch (goal.kind) {
    case "warren": return `${goal.program.name} ${goal.profile.track === "areaStudy" ? "Area Study" : "PofC"}`;
    case "area": return goal.areas.length === 1
      ? `${collegeName(goal.college)} ${goal.areas[0].slice(goal.areas[0].indexOf(":") + 1)} GE`
      : `${collegeName(goal.college)} GE`;
    case "university": return goal.list === "campus:DEI" ? "DEI" : "AHI";
    case "subjects": return goal.label.toLowerCase().startsWith("your major") ? "major" : goal.label;
  }
}

/** What a goal is called in a sentence or a chip. */
export function goalLabel(goal: Goal): string {
  switch (goal.kind) {
    case "warren": return `Warren ${goal.profile.track === "areaStudy" ? "Area Study" : "PofC"} · ${goal.program.name}`;
    case "area": return goal.areas.length === 1
      ? `${collegeName(goal.college)} GE · ${goal.areas[0].slice(goal.areas[0].indexOf(":") + 1)}`
      : `${collegeName(goal.college)} GE requirements`;
    case "university": return UNIVERSITY_NAMES[goal.list];
    case "subjects": return goal.label;
  }
}

function pofcQuestion(resolution: ReturnType<typeof resolvePofc>, area: boolean): GoalQuestion | null {
  const kind = area ? "warren_area_study" : "warren_pofc";
  const unit = area ? "Area Study" : "PofC";
  if (resolution.kind === "choose-program") {
    // Every program UCSDPlans can list courses for, by name; the ones with lists kept elsewhere under "More".
    const listed = resolution.programs.filter((p) => programSubjects(p).length).sort((a, b) => a.name.localeCompare(b.name));
    const elsewhere = resolution.programs.filter((p) => !programSubjects(p).length);
    return {
      id: "pofc-program",
      text: `Which ${DISCIPLINE_NAMES[resolution.discipline]} ${unit}? Warren lists ${resolution.programs.length}.`,
      options: listed.map((p) => ({ label: p.name, ref: { kind, discipline: resolution.discipline, program: p.id } })),
      more: elsewhere.map((p) => ({ label: p.name, ref: { kind, discipline: resolution.discipline, program: p.id } })),
      note: "Each program is drawn from one department or a list Warren keeps. It's never every course in the discipline.",
    };
  }
  if (resolution.kind === "choose-discipline" || resolution.kind === "same-as-major") {
    const options = resolution.kind === "same-as-major" ? resolution.others : resolution.disciplines;
    return {
      id: "pofc-discipline",
      text: `Which discipline is this ${unit} in?`,
      options: options.map((d) => ({ label: DISCIPLINE_NAMES[d], ref: { kind, discipline: d, program: null } })),
    };
  }
  return null;
}

/**
 * The goal a requirement reference names, for this student. Anything the
 * student has not decided — which Warren program, which college — is asked,
 * never chosen for them, and a goal the rules rule out says why.
 */
export function resolveGoal(
  ref: RequirementRef,
  student: { major: string; college: string | null },
  ge: GEFile | null,
): GoalResolution {
  if (ref.kind === "warren_pofc" || ref.kind === "warren_area_study") {
    const resolution = resolvePofc({ discipline: ref.discipline, program: ref.program }, student.major);
    const area = resolution.profile.track === "areaStudy";
    const notes: string[] = [];
    if (student.college && student.college !== "warren") {
      notes.push(`Your planner says ${collegeName(student.college)}. Programs of Concentration are Warren College's requirement.`);
    }
    if (ref.kind === "warren_pofc" && area) {
      notes.push("Warren lists your major as a B.S. engineering major, so Area Studies (3 courses each) apply instead of PofCs.");
    }
    if (resolution.profile.trackUnsure) {
      notes.push("Warren's pages don't say whether your major follows PofCs or Area Studies. Check with Warren Advising.");
    }
    switch (resolution.kind) {
      case "program":
        return { kind: "goal", goal: { kind: "warren", program: resolution.program, discipline: resolution.discipline, profile: resolution.profile }, notes };
      case "listed-elsewhere":
        return {
          kind: "listed-elsewhere",
          program: resolution.program,
          text: `${resolution.program.name} needs specific courses from a list Warren or the department keeps, so UCSDPlans can't list them yet.`,
        };
      case "same-as-major":
        return {
          kind: "blocked",
          text: `Warren needs each ${area ? "Area Study" : "PofC"} outside your major's discipline. Your major is in ${DISCIPLINE_NAMES[resolution.discipline]}, so a program there wouldn't count.`,
          question: pofcQuestion(resolution, area),
        };
      default:
        return { kind: "ask", question: pofcQuestion(resolution, area)!, notes };
    }
  }
  if (ref.kind === "university") return { kind: "goal", goal: { kind: "university", list: ref.list }, notes: [] };
  if (ref.kind === "major") {
    const subjects = [...majorSubjects(student.major)];
    return subjects.length
      ? { kind: "goal", goal: { kind: "subjects", subjects, label: "Your major's departments" }, notes: ["Major requirements aren't modelled course by course. These are courses in your major's departments."] }
      : { kind: "blocked", text: "UCSDPlans doesn't know which departments teach your major yet. Name a course or a department.", question: null };
  }
  // A college GE: the student's own college unless they named one.
  const college = ref.college ?? student.college;
  const areas = ge?.areas.filter((a) => a.college === college && a.college !== CAMPUS) ?? [];
  if (!college) {
    return {
      kind: "ask",
      question: {
        id: "college",
        text: "Which college's GE requirements?",
        options: ["revelle", "muir", "marshall", "warren", "erc", "sixth", "seventh", "eighth"].map((c) => ({
          label: collegeName(c), college: c, ref: { kind: "college_ge", college: c, area: ref.area, words: ref.words },
        })),
      },
    };
  }
  if (college === "warren" && !ref.area) {
    // Warren's GE beyond Formal Skills and Ethics is its PofCs: ask which discipline.
    const words = ref.words;
    const discipline: WarrenDiscipline | null = words === "social" ? "social" : words === "humanities" ? "humanities" : words === "natural" ? "science" : null;
    return resolveGoal({ kind: "warren_pofc", discipline, program: null }, { ...student, college }, ge);
  }
  if (ref.area) return { kind: "goal", goal: { kind: "area", college, areas: [ref.area] }, notes: [] };
  const matching = ref.words ? areas.filter((a) => a.area.toLowerCase().includes(ref.words!)) : [];
  if (matching.length === 1) return { kind: "goal", goal: { kind: "area", college, areas: [matching[0].key] }, notes: [] };
  if (!areas.length) {
    return { kind: "blocked", text: `UCSDPlans has no GE lists for ${collegeName(college)} yet.`, question: null };
  }
  return {
    kind: "ask",
    question: {
      id: "area",
      text: `Which ${collegeName(college)} GE area?`,
      options: (matching.length ? matching : areas).slice(0, 8).map((a) => ({
        label: a.area, ref: { kind: "college_ge", college, area: a.key, words: null },
      })),
    },
  };
}

/** The subjects or list a goal draws candidates from. */
export function goalScope(goal: Goal, ge: GEFile | null): { subjects: string[] | null; codes: Set<string> | null } {
  switch (goal.kind) {
    case "warren": return { subjects: programSubjects(goal.program), codes: null };
    case "area": return { subjects: null, codes: new Set(goal.areas.flatMap((k) => ge?.lists[k] ?? [])) };
    case "university": return { subjects: null, codes: new Set(ge?.lists[goal.list] ?? []) };
    case "subjects": return { subjects: goal.subjects, codes: null };
  }
}

/** What one course can claim toward the goal, and on what basis. */
export function requirementCheck(row: CourseRow, goal: Goal, ge: GEFile | null): Check {
  const course = row.k;
  switch (goal.kind) {
    case "warren": {
      const fit = pofcCourseFit(row, goal.program);
      const track = WARREN_TRACKS[goal.profile.track];
      return fit.kind === "counts-by-rule"
        ? { status: "unknown", code: "REQ_RULE", basis: "rule", course, detail: { program: goal.program.name, unit: track.short, courses: track.courses, upper: track.upperDivision } }
        : { status: "fail", code: "REQ_EXCLUDED", basis: "rule", course, detail: { program: goal.program.name, reason: fit.reason } };
    }
    case "area": {
      const hit = goal.areas.find((k) => ge?.lists[k]?.includes(course));
      return hit
        ? { status: "unknown", code: "REQ_COMMUNITY_LIST", basis: "community", course, detail: { area: hit.slice(hit.indexOf(":") + 1), college: collegeName(goal.college) } }
        : { status: "fail", code: "REQ_NOT_LISTED", basis: "community", course, detail: { college: collegeName(goal.college) } };
    }
    case "university": {
      const listed = ge?.lists[goal.list]?.includes(course);
      const meta = goal.list === "campus:DEI" ? ge?.meta.campus?.dei : ge?.meta.campus?.ahi;
      return listed
        ? { status: "pass", code: "REQ_OFFICIAL_LIST", basis: "official", course, detail: { list: goal.list.slice(7), asOf: meta?.retrieved ?? "" } }
        : { status: "fail", code: "REQ_NOT_LISTED", basis: "official", course, detail: { list: goal.list.slice(7) } };
    }
    case "subjects":
      return goal.subjects.includes(row.s)
        ? { status: "unknown", code: "REQ_RULE", basis: "rule", course, detail: { program: goal.label, unit: "", courses: 0, upper: 0 } }
        : { status: "fail", code: "REQ_NOT_LISTED", basis: "rule", course, detail: { college: goal.label } };
  }
}

/** Where the goal's claims come from, with dates. */
export function goalSources(goal: Goal, ge: GEFile | null): SourceRef[] {
  switch (goal.kind) {
    case "warren":
      return [{ id: "warren", label: "Warren College, Programs of Concentration", url: goal.profile.track === "areaStudy" ? WARREN_SOURCE.areaStudiesUrl : WARREN_SOURCE.url, asOf: WARREN_SOURCE.checked }];
    case "area":
      return [{ id: "ge-lists", label: "College GE lists, compiled by students (may be incomplete)", asOf: ge?.meta.date ?? null }];
    case "university": {
      const meta = goal.list === "campus:DEI" ? ge?.meta.campus?.dei : ge?.meta.campus?.ahi;
      return meta ? [{ id: goal.list, label: meta.source, url: meta.url, asOf: meta.retrieved }] : [];
    }
    case "subjects":
      return [];
  }
}

/**
 * Every requirement one course may count toward for this student, for "what
 * requirement might it satisfy?": their college's GE areas (community lists),
 * the university lists (official), and Warren's rule when they are at Warren.
 */
export function requirementsFor(row: CourseRow, student: { major: string; college: string | null }, ge: GEFile | null): Check[] {
  const out: Check[] = [];
  for (const list of ["campus:DEI", "campus:AHI"] as const) {
    if (ge?.lists[list]?.includes(row.k)) out.push(requirementCheck(row, { kind: "university", list }, ge));
  }
  if (student.college && student.college !== "warren") {
    const areas = (ge?.areas ?? []).filter((a) => a.college === student.college && ge?.lists[a.key]?.includes(row.k)).map((a) => a.key);
    if (areas.length) out.push(requirementCheck(row, { kind: "area", college: student.college, areas }, ge));
  }
  if (student.college === "warren") {
    for (const p of ["economics", "political-science", "psychology", "sociology", "anthropology", "communication", "history", "literature", "music", "philosophy", "visual-arts", "theatre-dance", "biology", "chemistry", "mathematics", "physics", "cognitive-science", "linguistics-general", "urban-studies", "critical-gender-studies", "ethnic-studies"]) {
      const program = programById(p)!;
      if (!programSubjects(program).includes(row.s)) continue;
      const resolution = resolvePofc({ program: p }, student.major);
      if (resolution.kind === "program") out.push(requirementCheck(row, { kind: "warren", program, discipline: resolution.discipline, profile: resolution.profile }, ge));
    }
  }
  return out;
}

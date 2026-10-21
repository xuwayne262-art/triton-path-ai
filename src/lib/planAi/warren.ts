import { DEPARTMENTS, disciplineForSubject } from "@/data/ucsdStructure";
import { majorSubjects } from "@/lib/plannerBridge";
import type { CourseRow } from "@/lib/plat";

/**
 * Warren College's Programs of Concentration (PofC) and Area Studies, as
 * Warren publishes them.
 *
 * Warren does not keep one GE list the way the other colleges do. A student
 * completes two programs, each from a discipline that is neither their
 * major's nor the other program's, so "a social science PofC" is a choice
 * among some twenty-eight programs — Economics, Political Science, … — and
 * never one list of social-science courses. It is also not the program
 * called "Perspectives of Social Science", which is only one of them.
 *
 * What is encoded is what Warren's own pages say (checked on the date
 * below): the rules, the program names in each discipline and their marks.
 * Warren names programs but publishes no course list for the department
 * programs, so a department's own courses are said to "count under Warren's
 * rule", never verified. Specialized and interdisciplinary programs have
 * specific course lists kept elsewhere; for those nothing is claimed.
 */

export type WarrenDiscipline = "humanities" | "social" | "science";

export const WARREN_SOURCE = {
  publisher: "Warren College",
  url: "https://warren.ucsd.edu/academics/general-education/programs-of-concentration.html",
  areaStudiesUrl: "https://warren.ucsd.edu/academics/general-education/area-studies.html",
  checked: "2026-10-21",
  /** What these rules cover, and what they leave to Warren Advising. */
  coverage: "Rules and program names. Warren does not list courses for department programs; specialized and interdisciplinary programs keep their own lists.",
} as const;

export const DISCIPLINE_NAMES: Record<WarrenDiscipline, string> = {
  humanities: "Humanities and Fine Arts",
  social: "Social Sciences",
  science: "Math, Natural Sciences, and Physical Sciences",
};

/** The rule for each track, as Warren states it. */
export const WARREN_TRACKS = {
  pofc: {
    name: "Programs of Concentration (PofC)",
    short: "PofC",
    programs: 2,
    courses: 6,
    upperDivision: 3,
    unitsEach: 4,
    atUcsd: 2,
    languageMax: 3,
  },
  areaStudy: {
    name: "Area Studies",
    short: "Area Study",
    programs: 2,
    courses: 3,
    upperDivision: 2,
    unitsEach: 4,
    atUcsd: 1,
    languageMax: 2,
  },
} as const;

export type WarrenTrack = keyof typeof WARREN_TRACKS;

export interface WarrenProgram {
  id: string;
  name: string;
  disciplines: WarrenDiscipline[];
  /** "#": counts in only one discipline. */
  oneDiscipline?: boolean;
  /** "*": specialized, with specific courses required. */
  specialized?: boolean;
  /** "+": only one of Humanities, Science and Technology, or Perspectives of Social Science. */
  exclusive?: boolean;
  /**
   * The department whose courses make up the program, for programs named
   * after one department. Absent where the courses come from a list Warren
   * or the department keeps.
   */
  department?: string;
}

const P = (
  id: string, name: string, disciplines: WarrenDiscipline[],
  extra: Omit<WarrenProgram, "id" | "name" | "disciplines"> = {},
): WarrenProgram => ({ id, name, disciplines, ...extra });

/** Every program Warren lists, in its order within each discipline. */
export const WARREN_PROGRAMS: WarrenProgram[] = [
  P("african-american-studies", "African American Studies", ["humanities", "social"], { oneDiscipline: true }),
  P("anti-racism", "Anti-Racism", ["humanities", "social"], { oneDiscipline: true, specialized: true }),
  P("aapi-studies", "Asian American and Pacific Islander Studies", ["humanities", "social"], { oneDiscipline: true }),
  P("chicanx-latinx-studies", "Chicanx and Latinx Studies", ["humanities", "social"], { oneDiscipline: true }),
  P("chinese-studies", "Chinese Studies", ["humanities", "social"], { oneDiscipline: true }),
  P("european-studies", "European Studies", ["humanities", "social"], { oneDiscipline: true }),
  P("history", "History", ["humanities"], { department: "history" }),
  P("humanities", "Humanities", ["humanities"], { specialized: true, exclusive: true }),
  P("japanese-studies", "Japanese Studies", ["humanities", "social"], { oneDiscipline: true }),
  P("jewish-studies", "Jewish Studies", ["humanities", "social"], { oneDiscipline: true }),
  P("latin-american-studies", "Latin American Studies", ["humanities", "social"], { oneDiscipline: true }),
  P("literature", "Literature", ["humanities"], { department: "literature" }),
  P("middle-east-studies", "Middle East Studies", ["humanities", "social"], { oneDiscipline: true }),
  P("music", "Music", ["humanities"], { department: "music" }),
  P("philosophy", "Philosophy", ["humanities"], { department: "philosophy" }),
  P("theatre-dance", "Theatre and Dance", ["humanities"], { department: "theatre-dance" }),
  P("transnational-korean-studies", "Transnational Korean Studies", ["humanities"]),
  P("visual-arts", "Visual Arts", ["humanities"], { department: "visual-arts" }),

  P("biology", "Biology", ["science"], { department: "biology" }),
  P("chemistry", "Chemistry", ["science"], { department: "chemistry" }),
  P("cognitive-science", "Cognitive Science", ["science", "social"], { oneDiscipline: true, department: "cognitive-science" }),
  P("fundamentals-of-biology", "Fundamentals of Biology", ["science"], { specialized: true }),
  P("mathematics", "Mathematics", ["science"], { department: "mathematics" }),
  P("physics", "Physics", ["science"], { department: "physics" }),
  P("science-and-technology", "Science and Technology", ["science"], { specialized: true, exclusive: true }),
  P("scripps-oceanography", "Scripps Institution of Oceanography", ["science"], { specialized: true }),

  P("anthropology", "Anthropology", ["social"], { department: "anthropology" }),
  P("business", "Business", ["social"], { specialized: true }),
  P("communication", "Communication", ["social"], { department: "communication" }),
  P("critical-gender-studies", "Critical Gender Studies", ["social"], { department: "critical-gender" }),
  P("economics", "Economics", ["social"], { department: "economics" }),
  P("education-sciences", "Education Sciences", ["social"], { specialized: true }),
  P("environmental-studies", "Environmental Studies", ["social"], { specialized: true }),
  P("ethnic-studies", "Ethnic Studies", ["social"], { department: "ethnic-studies" }),
  P("human-developmental-sciences", "Human Developmental Sciences", ["social"], { specialized: true }),
  P("law-and-society", "Law and Society", ["social"], { specialized: true, oneDiscipline: true }),
  P("linguistics-general", "Linguistics/General", ["social"], { department: "linguistics" }),
  P("linguistics-and-language", "Linguistics and Language", ["social"], { specialized: true }),
  P("perspectives-of-social-science", "Perspectives of Social Science", ["social"], { specialized: true, exclusive: true }),
  P("political-science", "Political Science", ["social"], { department: "political-science" }),
  P("psychology", "Psychology", ["social"], { department: "psychology" }),
  P("sociology", "Sociology", ["social"], { department: "sociology" }),
  P("urban-studies", "Urban Studies and Planning", ["social"], { department: "urban-studies" }),
];

export const programById = (id: string | null | undefined) => WARREN_PROGRAMS.find((p) => p.id === id) ?? null;

/** Programs a discipline offers, department programs first: those are the ones UCSDPlans can list courses for. */
export function programsIn(discipline: WarrenDiscipline): WarrenProgram[] {
  return WARREN_PROGRAMS
    .filter((p) => p.disciplines.includes(discipline))
    .sort((a, b) => Number(Boolean(b.department)) - Number(Boolean(a.department)));
}

/**
 * The subjects whose courses make up a department program: Economics is
 * ECON. Empty for specialized and interdisciplinary programs, whose courses
 * come from a list kept elsewhere.
 */
export function programSubjects(program: WarrenProgram): string[] {
  if (!program.department || program.specialized) return [];
  return DEPARTMENTS.find((d) => d.id === program.department)?.subjects ?? [];
}

/**
 * A program named in a request — "economics pofc", "poli sci" — or null.
 * Matches whole names and the common short forms only.
 */
const PROGRAM_ALIASES: [RegExp, string][] = [
  [/\becon(?:omics)?\b/i, "economics"],
  [/\bpoli(?:tical)?\s*sci(?:ence)?\b|\bpolisci\b/i, "political-science"],
  [/\bpsych(?:ology)?\b/i, "psychology"],
  [/\bsociology\b/i, "sociology"],
  [/\banthro(?:pology)?\b/i, "anthropology"],
  [/\bcomm(?:unication)?s?\b(?!\s*\d)/i, "communication"],
  [/\burban\s+stud(?:y|ies)(?:\s+and\s+planning)?\b/i, "urban-studies"],
  [/\bcritical\s+gender\b/i, "critical-gender-studies"],
  [/\bethnic\s+stud(?:y|ies)\b/i, "ethnic-studies"],
  [/\bperspectives?\s+(?:of|on)\s+social\s+sci\w*\b/i, "perspectives-of-social-science"],
  [/\bcog(?:nitive)?\s*sci(?:ence)?\b|\bcogsci\b/i, "cognitive-science"],
  [/\blinguistics\b/i, "linguistics-general"],
  [/\bhistory\b/i, "history"],
  [/\blit(?:erature)?\b/i, "literature"],
  [/\bmusic\b/i, "music"],
  [/\bphil(?:osophy)?\b/i, "philosophy"],
  [/\btheat(?:re|er)(?:\s+and\s+dance)?\b/i, "theatre-dance"],
  [/\bvisual\s+arts?\b/i, "visual-arts"],
  [/\bbio(?:logy)?\b(?!\s*\d)/i, "biology"],
  [/\bchem(?:istry)?\b/i, "chemistry"],
  [/\bmath(?:ematics)?\b(?!\s*\d)/i, "mathematics"],
  [/\bphysics\b/i, "physics"],
  [/\bbusiness\b/i, "business"],
];

export function programFromText(text: string): { program: WarrenProgram; start: number; end: number } | null {
  let best: { program: WarrenProgram; start: number; end: number } | null = null;
  for (const [re, id] of PROGRAM_ALIASES) {
    const m = re.exec(text);
    if (!m) continue;
    const program = programById(id);
    if (program && (!best || m[0].length > best.end - best.start)) {
      best = { program, start: m.index, end: m.index + m[0].length };
    }
  }
  return best;
}

// ── Who follows which track ──────────────────────────────────────────────────

/**
 * B.S. engineering majors complete Area Studies instead of PofCs. Warren's
 * Area Studies page names them; these are the planner's spellings of the
 * majors it names. Data Science is not on it, so it is left to the
 * standard rule and flagged.
 */
const AREA_STUDY_MAJORS = new Set([
  "Aerospace Engineering (BS)",
  "Bioengineering (BS)",
  "Bioengineering: Bioinformatics (BS)",
  "Bioengineering: Biotechnology (BS)",
  "Chemical Engineering (BS)",
  "Chemical Engineering: Biotechnology (BS)",
  "Computer Engineering (BS)",
  "Computer Science (BS)",
  "Electrical Engineering (BS)",
  "Electrical and Computer Engineering (BS)",
  "Engineering Physics (BS)",
  "Mechanical Engineering (BS)",
  "NanoEngineering (BS)",
  "Structural Engineering (BS)",
]);

/** Majors Warren's pages do not settle either way. */
const UNSETTLED_MAJORS = new Set([
  "Data Science (BS)",
  "Machine Learning and Data Science (BS)",
  "Civil Engineering (BS)",
  "Environmental Engineering (BS)",
]);

export interface WarrenProfile {
  track: WarrenTrack;
  /** True when Warren's pages do not say which track the major follows. */
  trackUnsure: boolean;
  /** The major's discipline, when its subjects all fall in one. */
  majorDiscipline: WarrenDiscipline | null;
}

/** Which track a major follows and which discipline it is in, as far as the data can tell. */
export function warrenProfile(major: string): WarrenProfile {
  const disciplines = new Set(
    [...majorSubjects(major)].map((s) => disciplineForSubject(s)?.id).filter(Boolean) as WarrenDiscipline[],
  );
  return {
    track: AREA_STUDY_MAJORS.has(major) ? "areaStudy" : "pofc",
    trackUnsure: UNSETTLED_MAJORS.has(major),
    majorDiscipline: disciplines.size === 1 ? [...disciplines][0] : null,
  };
}

// ── Resolving a request ──────────────────────────────────────────────────────

export type PofcResolution =
  /** A program to list courses for. */
  | { kind: "program"; program: WarrenProgram; discipline: WarrenDiscipline; profile: WarrenProfile }
  /** Which program, among these. */
  | { kind: "choose-program"; discipline: WarrenDiscipline; programs: WarrenProgram[]; profile: WarrenProfile }
  /** Which discipline, among these. */
  | { kind: "choose-discipline"; disciplines: WarrenDiscipline[]; profile: WarrenProfile }
  /** Asked for a discipline the major already covers: not allowed. */
  | { kind: "same-as-major"; discipline: WarrenDiscipline; others: WarrenDiscipline[]; profile: WarrenProfile }
  /** A specialized or interdisciplinary program: its list is kept elsewhere. */
  | { kind: "listed-elsewhere"; program: WarrenProgram; profile: WarrenProfile };

const ALL: WarrenDiscipline[] = ["humanities", "social", "science"];

/**
 * What a PofC request can be answered with, for this student. A program the
 * student named wins; a discipline narrows the choice; the major rules its
 * own discipline out. Nothing is chosen for the student: anything left open
 * comes back as a question with its options.
 */
export function resolvePofc(
  ask: { discipline?: WarrenDiscipline | null; program?: string | null },
  major: string,
): PofcResolution {
  const profile = warrenProfile(major);
  const mine = profile.majorDiscipline;
  const program = programById(ask.program);
  if (program) {
    const discipline = ask.discipline && program.disciplines.includes(ask.discipline)
      ? ask.discipline
      : program.disciplines.find((d) => d !== mine) ?? program.disciplines[0];
    if (mine && discipline === mine) {
      return { kind: "same-as-major", discipline, others: ALL.filter((d) => d !== mine), profile };
    }
    if (!programSubjects(program).length) return { kind: "listed-elsewhere", program, profile };
    return { kind: "program", program, discipline, profile };
  }
  if (ask.discipline) {
    if (mine && ask.discipline === mine) {
      return { kind: "same-as-major", discipline: ask.discipline, others: ALL.filter((d) => d !== mine), profile };
    }
    return { kind: "choose-program", discipline: ask.discipline, programs: programsIn(ask.discipline), profile };
  }
  return { kind: "choose-discipline", disciplines: ALL.filter((d) => d !== mine), profile };
}

export type PofcCourseFit =
  | { kind: "counts-by-rule" }
  | { kind: "excluded"; reason: "MGT_EXCLUDED" | "SPECIAL_STUDIES" | "NOT_FOUR_UNITS" | "OTHER_DEPARTMENT" };

/**
 * Whether one course can go toward a department program under Warren's rule:
 * a four-unit course from the program's department, never a Rady (MGT)
 * course, never Special Studies 195. Upper-division and language caps apply
 * to the program as a whole and are reported with it, not here.
 */
export function pofcCourseFit(row: CourseRow, program: WarrenProgram): PofcCourseFit {
  if (row.s.startsWith("MGT")) return { kind: "excluded", reason: "MGT_EXCLUDED" };
  if (/^195/.test(row.c)) return { kind: "excluded", reason: "SPECIAL_STUDIES" };
  if (!programSubjects(program).includes(row.s)) return { kind: "excluded", reason: "OTHER_DEPARTMENT" };
  const range = unitRange(row.u);
  if (!range || range.min > 4 || range.max < 4) return { kind: "excluded", reason: "NOT_FOUR_UNITS" };
  return { kind: "counts-by-rule" };
}

/**
 * The catalog's units as a range: "4" is 4 to 4, "1-4" is 1 to 4. A
 * multi-quarter sequence ("4-4-4") is per quarter. Null when unstated.
 */
export function unitRange(u: string | null | undefined): { min: number; max: number } | null {
  if (!u) return null;
  const first = u.split("/")[0];
  if (/^\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?){2,}$/.test(first)) {
    const n = Number(first.split("-")[0]);
    return Number.isFinite(n) ? { min: n, max: n } : null;
  }
  const m = /^(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?$/.exec(first);
  if (!m) return null;
  const min = Number(m[1]);
  const max = m[2] ? Number(m[2]) : min;
  return max >= min ? { min, max } : null;
}

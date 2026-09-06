/**
 * Bridges the course explorer and the planner.
 *
 * The explorer works with the 8,000-course UCSDPlans dataset keyed by course
 * code ("CSE 11"); the planner works with its own `Course` objects keyed by a
 * slug id. Nothing translated between them, so anything saved in the explorer
 * silently never reached the planner. Everything here exists to make the code
 * the single shared identity.
 */

import type { Course, CourseCategory, CourseTime, DayOfWeek } from "@/components/triton/types";
import { splitDays, type CourseRow } from "@/lib/plat";

/** "CSE 11" -> "cse11", matching the id shape the planner already generates. */
export const codeToId = (code: string) => code.toLowerCase().replace(/\s+/g, "");

const DAY_MAP: Record<string, DayOfWeek> = {
  M: "Mon", Tu: "Tue", W: "Wed", Th: "Thu", F: "Fri",
};

/** "9:30a" -> "09:30", the 24-hour form the weekly calendar expects. */
function to24h(t: string | null): string | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})\s*([ap])$/i.exec(t.trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "p") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** Real meeting times from the WebReg snapshot, when the course has them. */
export function rowToTimes(row: CourseRow): CourseTime[] | undefined {
  const start = to24h(row.st);
  const end = to24h(row.en);
  if (!start || !end) return undefined;
  const days = splitDays(row.d)
    .map((d) => DAY_MAP[d])
    .filter((d): d is DayOfWeek => Boolean(d));
  if (!days.length) return undefined;
  return days.map((day) => ({ day, start, end }));
}

/**
 * Converts an explorer row into the shape the planner understands.
 *
 * `majorSubs` matters for the degree audit: majors track progress in
 * "Lower Division" / "Upper Division" units, so a course only earns that credit
 * when it belongs to a subject the major is actually taught in. Stamping the
 * division on every course would credit a dance class toward a CS degree.
 */
export function platRowToCourse(row: CourseRow, majorSubs?: Set<string>): Course {
  const categories = categoriesForGE(row.ge);
  if (majorSubs?.has(row.s)) {
    const num = parseInt(row.c, 10) || 0;
    if (num > 0 && num < 100) categories.push("Lower Division");
    else if (num >= 100 && num < 200) categories.push("Upper Division");
  }
  return {
    id: codeToId(row.k),
    code: row.k,
    title: row.t || row.k,
    units: row.u ? parseFloat(row.u) : 4,
    departments: [row.s],
    genEd: row.ge,
    categories,
    time: rowToTimes(row),
  };
}

// ── Colour meaning ───────────────────────────────────────────────────────────
// Colour used to be `COURSE_COLORS[index % 10]` — decorative and meaningless, so
// two adjacent blue blocks implied a relationship that did not exist. It now
// encodes the one thing a degree planner is actually for: what the course counts
// toward.

export type CourseRole = "major" | "minor" | "ge" | "elective";

export interface RoleStyle {
  label: string;
  /** Sidebar / calendar block. */
  bg: string;
  border: string;
  text: string;
  /** Solid colour for legends and dots. */
  hex: string;
}

export const ROLE_STYLES: Record<CourseRole, RoleStyle> = {
  major: {
    label: "Major requirement",
    bg: "bg-blue-100 dark:bg-blue-500/20",
    border: "border-blue-500",
    text: "text-blue-900 dark:text-blue-200",
    hex: "#3b82f6",
  },
  minor: {
    label: "Minor requirement",
    bg: "bg-teal-100 dark:bg-teal-500/20",
    border: "border-teal-500",
    text: "text-teal-900 dark:text-teal-200",
    hex: "#14b8a6",
  },
  ge: {
    label: "General education",
    bg: "bg-amber-100 dark:bg-amber-500/20",
    border: "border-amber-500",
    text: "text-amber-900 dark:text-amber-200",
    hex: "#f59e0b",
  },
  elective: {
    label: "Elective",
    bg: "bg-slate-100 dark:bg-white/10",
    border: "border-slate-400",
    text: "text-slate-700 dark:text-slate-200",
    hex: "#94a3b8",
  },
};

export interface RoleContext {
  majorCategories: Set<string>;
  minorCategories: Set<string>;
  /** Lowercased college slug, e.g. "revelle". */
  collegeSlug: string | null;
  /** Subject codes belonging to the selected major, e.g. {"CSE"}. */
  majorSubjects: Set<string>;
}

/** What a course counts toward, most specific claim first. */
export function courseRole(course: Course, ctx: RoleContext): CourseRole {
  const cats = course.categories ?? [];
  if (cats.some((c) => ctx.majorCategories.has(c))) return "major";
  if (cats.some((c) => ctx.minorCategories.has(c))) return "minor";

  // Falls back to the subject when the course carries no category mapping,
  // which is the common case for explorer-sourced courses.
  const subject = course.departments?.[0] ?? course.code.split(" ")[0];
  if (ctx.majorSubjects.has(subject)) return "major";

  const ge = course.genEd ?? [];
  if (ge.length) {
    if (!ctx.collegeSlug) return "ge";
    return ge.some((g) => g.startsWith(`${ctx.collegeSlug}:`)) ? "ge" : "elective";
  }
  return "elective";
}

/**
 * Maps a major name to the subject codes it is taught in, so "Computer Science
 * (BS)" colours CSE courses as major requirements.
 */
export function majorSubjects(major: string): Set<string> {
  const m = major.toLowerCase();
  const hit = (needle: string) => m.includes(needle);
  const out = new Set<string>();
  if (hit("computer science") || hit("computer engineering")) { out.add("CSE"); out.add("ECE"); }
  if (hit("data science")) { out.add("DSC"); out.add("CSE"); out.add("MATH"); }
  if (hit("mathematic")) out.add("MATH");
  if (hit("cognitive")) out.add("COGS");
  if (hit("econom")) out.add("ECON");
  if (hit("biolog")) { out.add("BILD"); out.add("BICD"); out.add("BIMM"); out.add("BIPN"); out.add("BIEB"); }
  if (hit("chemis") || hit("biochem")) out.add("CHEM");
  if (hit("physic")) out.add("PHYS");
  if (hit("psycho")) out.add("PSYC");
  if (hit("political")) out.add("POLI");
  if (hit("sociolog")) out.add("SOCI");
  if (hit("communicat")) out.add("COMM");
  if (hit("mechanical") || hit("aerospace")) out.add("MAE");
  if (hit("bioengineer")) out.add("BENG");
  if (hit("electrical")) out.add("ECE");
  if (hit("structural")) out.add("SE");
  if (hit("nanoengineer")) out.add("NANO");
  if (hit("chemical engineer")) out.add("CENG");
  if (hit("literature")) out.add("LTEN");
  if (hit("linguistic")) out.add("LIGN");
  if (hit("history")) out.add("HILD");
  if (hit("philosoph")) out.add("PHIL");
  if (hit("visual art")) out.add("VIS");
  if (hit("music")) out.add("MUS");
  if (hit("public health") || hit("global health")) { out.add("FMPH"); out.add("GLBH"); }
  if (hit("urban")) out.add("USP");
  if (hit("management") || hit("business")) { out.add("MGT"); out.add("ECON"); }
  return out;
}

// ── Popularity ───────────────────────────────────────────────────────────────

/**
 * How commonly a course is taken. Seat capacity is the honest proxy — UCSD sizes
 * a room to expected demand — reinforced by how many terms it has grade history
 * for. Upper-division and graduate courses are damped so the big lower-division
 * lectures everyone actually needs rise to the top.
 */
export function popularity(row: CourseRow): number {
  const seats = row.sl ?? 0;
  const history = Math.min(row.r, 12);
  const num = parseInt(row.c, 10) || 0;

  let level = 1;
  if (num >= 200) level = 0.15;        // graduate
  else if (num >= 100) level = 0.55;   // upper division
  if (!row.o) level *= 0.4;            // not on this term's schedule

  return (seats + history * 25) * level;
}

/** Sorts most-taken first; graduate and niche upper-division sink to the bottom. */
export function byPopularity(a: CourseRow, b: CourseRow): number {
  return popularity(b) - popularity(a);
}

// ── GE area -> planner requirement category ──────────────────────────────────
// The dataset names areas the way each college's catalog does; the planner
// tracks its own category list. Without this table an explorer-sourced course
// carried no category, so adding it moved no progress bar — the degree audit
// silently ignored it. Anything genuinely ambiguous is left unmapped rather
// than credited to the wrong requirement.

const GE_CATEGORY: Record<string, CourseCategory> = {
  "revelle:Mathematics": "Math",
  "revelle:Natural Science": "Science",
  "revelle:Language": "Language",

  "muir:Social Sciences": "Social Science Seq",
  "muir:Math or Nat. Science": "Math/Science Seq",
  "muir:Humanities / Arts / Language": "Fine Arts/Humanities Seq",

  "marshall:Natural Science": "Natural Science",
  "marshall:Math / Stats / Logic": "Math/Stats",
  "marshall:Humanities & Cultural": "Humanities/Culture",
  "marshall:Fine Arts": "Disciplinary Breadth",

  "warren:Ethics & Society": "Ethics & Society",

  "erc:Natural Science": "Natural Science",
  "erc:Quantitative Methods": "Quantitative",
  "erc:Language": "Language",

  "sixth:IT Fluency": "Info Tech",
  "sixth:Art Making": "Art",
  "sixth:Exploring Data": "Math/Logic",
  "sixth:Modes of Inquiry · Humanities": "Humanities",

  "seventh:Alternatives · Arts": "Arts",
  "seventh:Alternatives · Humanities": "Humanities",
  "seventh:Alternatives · Social Sci": "Social Science",
  "seventh:Alternatives · Natural Sci": "Natural Science",

  "eighth:Breadth · Arts": "Arts",
  "eighth:Breadth · Humanities": "Humanities",
  "eighth:Breadth · Social Sci": "Social Science",
  "eighth:Breadth · Natural Sci": "Natural Science",
};

/** Requirement categories a course satisfies, derived from its GE areas. */
export function categoriesForGE(geKeys: string[] | undefined): CourseCategory[] {
  if (!geKeys?.length) return [];
  const out = new Set<CourseCategory>();
  for (const key of geKeys) {
    const direct = GE_CATEGORY[key];
    if (direct) { out.add(direct); continue; }
    // ERC spells every region separately; they all satisfy the same requirement.
    if (key.startsWith("erc:Regional Specialization")) out.add("Regional Spec");
  }
  return [...out];
}

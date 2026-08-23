/**
 * UC San Diego's academic structure.
 *
 * The site previously treated every course prefix as a "department", which gave
 * 189 of them and split single departments apart — BILD, BICD, BIEB, BIMM, BIPN
 * and BISP are all one department (Biological Sciences), not six.
 *
 * The real hierarchy has four distinct entities, and they are not a single
 * chain:
 *
 *   School / Division  →  Department  →  Subject code  →  Course
 *                                    ↘  Major
 *
 *   College  ──────────────────────────  a parallel axis
 *
 * Colleges (Revelle, Muir, …) are residential units that set general-education
 * and writing requirements. Every undergraduate belongs to one, but colleges do
 * not own majors or academic departments — the only courses they own are their
 * own writing/core sequences (HUM, MCWP, DOC, MMW, CAT, SYN, WCWP). Listing them
 * alongside departments, as the old UI did, conflates two unrelated things.
 *
 * Sources: catalog.ucsd.edu course pages (authoritative for which prefixes a
 * department owns) and evc.ucsd.edu/about/Divisions and Schools.
 */

export interface School {
  id: string;
  name: string;
  /** Short label for dense UI. */
  short: string;
}

export interface Department {
  id: string;
  name: string;
  schoolId: string;
  /** Course prefixes this department owns. */
  subjects: string[];
}

export interface CollegeUnit {
  id: string;
  name: string;
  /** Writing / core sequence prefixes the college itself owns. */
  subjects: string[];
}

// ── Schools and divisions ────────────────────────────────────────────────────

export const SCHOOLS: School[] = [
  { id: "arts-humanities", name: "School of Arts and Humanities", short: "Arts & Humanities" },
  { id: "biological", name: "School of Biological Sciences", short: "Biological Sciences" },
  { id: "physical", name: "School of Physical Sciences", short: "Physical Sciences" },
  { id: "social", name: "School of Social Sciences", short: "Social Sciences" },
  { id: "engineering", name: "Jacobs School of Engineering", short: "Engineering" },
  { id: "computing", name: "School of Computing, Information and Data Sciences", short: "Computing & Data" },
  { id: "scripps", name: "Scripps Institution of Oceanography", short: "Scripps" },
  { id: "health", name: "Health Sciences and Public Health", short: "Health Sciences" },
  { id: "rady", name: "Rady School of Management", short: "Rady" },
  { id: "gps", name: "School of Global Policy and Strategy", short: "Global Policy" },
  { id: "interdisciplinary", name: "Interdisciplinary and Campus-Wide Programs", short: "Interdisciplinary" },
];

// ── Departments ──────────────────────────────────────────────────────────────

export const DEPARTMENTS: Department[] = [
  // ── Arts and Humanities ───────────────────────────────────────────────────
  {
    id: "history", name: "History", schoolId: "arts-humanities",
    subjects: ["HILD", "HIAF", "HIEA", "HIEU", "HIGL", "HIGR", "HILA", "HINE", "HISA", "HISC", "HITO", "HIUS"],
  },
  {
    id: "literature", name: "Literature", schoolId: "arts-humanities",
    subjects: ["LTAF", "LTAM", "LTCH", "LTCO", "LTCS", "LTEA", "LTEN", "LTEU", "LTFR",
      "LTGK", "LTGM", "LTIT", "LTKO", "LTLA", "LTRU", "LTSP", "LTTH", "LTWL", "LTWR"],
  },
  { id: "music", name: "Music", schoolId: "arts-humanities", subjects: ["MUS"] },
  { id: "philosophy", name: "Philosophy", schoolId: "arts-humanities", subjects: ["PHIL"] },
  {
    id: "theatre-dance", name: "Theatre and Dance", schoolId: "arts-humanities",
    subjects: ["TDAC", "TDCH", "TDDE", "TDDM", "TDDR", "TDGE", "TDGR", "TDHD", "TDHT",
      "TDMV", "TDPF", "TDPR", "TDPW", "TDTR"],
  },
  {
    id: "visual-arts", name: "Visual Arts", schoolId: "arts-humanities",
    subjects: ["VIS", "ICAM", "FILM"],
  },

  // ── Biological Sciences ───────────────────────────────────────────────────
  {
    id: "biology", name: "Biological Sciences", schoolId: "biological",
    subjects: ["BILD", "BIBC", "BICD", "BIEB", "BIMM", "BIPN", "BISP",
      "BGGN", "BGJC", "BGRD", "BGSE", "BNFO"],
  },

  // ── Physical Sciences ─────────────────────────────────────────────────────
  { id: "astronomy", name: "Astronomy and Astrophysics", schoolId: "physical", subjects: ["ASTR"] },
  { id: "chemistry", name: "Chemistry and Biochemistry", schoolId: "physical", subjects: ["CHEM"] },
  { id: "mathematics", name: "Mathematics", schoolId: "physical", subjects: ["MATH"] },
  { id: "physics", name: "Physics", schoolId: "physical", subjects: ["PHYS"] },

  // ── Social Sciences ───────────────────────────────────────────────────────
  {
    id: "anthropology", name: "Anthropology", schoolId: "social",
    subjects: ["ANTH", "ANAR", "ANBI", "ANSC"],
  },
  { id: "cognitive-science", name: "Cognitive Science", schoolId: "social", subjects: ["COGS", "COGR"] },
  { id: "communication", name: "Communication", schoolId: "social", subjects: ["COMM"] },
  { id: "economics", name: "Economics", schoolId: "social", subjects: ["ECON"] },
  { id: "education", name: "Education Studies", schoolId: "social", subjects: ["EDS", "MSED"] },
  {
    id: "ethnic-studies", name: "Ethnic Studies", schoolId: "social",
    subjects: ["ETHN", "AAS", "AAPI", "TWS"],
  },
  {
    id: "linguistics", name: "Linguistics", schoolId: "social",
    subjects: ["LIGN", "LING", "LIAB", "LIDS", "LIFR", "LIGM", "LIHL", "LIIT", "LIPO", "LISL", "LISP"],
  },
  { id: "political-science", name: "Political Science", schoolId: "social", subjects: ["POLI"] },
  { id: "psychology", name: "Psychology", schoolId: "social", subjects: ["PSYC", "CLIN", "CLX"] },
  { id: "sociology", name: "Sociology", schoolId: "social", subjects: ["SOCI", "SOC", "SOCE", "SOCG"] },
  { id: "urban-studies", name: "Urban Studies and Planning", schoolId: "social", subjects: ["USP"] },
  { id: "human-development", name: "Human Developmental Sciences", schoolId: "social", subjects: ["HDS", "HDP"] },
  { id: "critical-gender", name: "Critical Gender Studies", schoolId: "social", subjects: ["CGS"] },
  { id: "computational-social", name: "Computational Social Science", schoolId: "social", subjects: ["CSS"] },

  // ── Jacobs School of Engineering ──────────────────────────────────────────
  { id: "bioengineering", name: "Bioengineering", schoolId: "engineering", subjects: ["BENG"] },
  { id: "cse", name: "Computer Science and Engineering", schoolId: "engineering", subjects: ["CSE"] },
  { id: "ece", name: "Electrical and Computer Engineering", schoolId: "engineering", subjects: ["ECE"] },
  { id: "mae", name: "Mechanical and Aerospace Engineering", schoolId: "engineering", subjects: ["MAE"] },
  {
    id: "nanoengineering", name: "Chemical and Nano Engineering", schoolId: "engineering",
    subjects: ["NANO", "CENG"],
  },
  { id: "structural", name: "Structural Engineering", schoolId: "engineering", subjects: ["SE"] },
  {
    id: "engineering-programs", name: "Engineering Programs", schoolId: "engineering",
    subjects: ["ENG", "MATS", "COSE", "ETIM", "DSE"],
  },

  // ── Computing and Data ────────────────────────────────────────────────────
  { id: "data-science", name: "Data Science", schoolId: "computing", subjects: ["DSC"] },
  { id: "design", name: "Design", schoolId: "computing", subjects: ["DSGN"] },

  // ── Scripps ───────────────────────────────────────────────────────────────
  {
    id: "scripps-oceanography", name: "Oceanography and Earth Science", schoolId: "scripps",
    subjects: ["SIO", "SIOB", "SIOC", "SIOG", "MBC"],
  },

  // ── Health Sciences ───────────────────────────────────────────────────────
  {
    id: "public-health", name: "Public Health", schoolId: "health",
    subjects: ["PH", "PHB", "FMPH", "FPM", "FPMU", "SPPH"],
  },
  { id: "global-health", name: "Global Health", schoolId: "health", subjects: ["GLBH"] },
  { id: "neurosciences", name: "Neurosciences", schoolId: "health", subjects: ["NEU", "NEUG"] },
  { id: "pharmacy", name: "Skaggs School of Pharmacy", schoolId: "health", subjects: ["SPPS"] },
  { id: "audiology", name: "Audiology and Speech Sciences", schoolId: "health", subjects: ["AUD"] },
  {
    id: "medicine", name: "School of Medicine", schoolId: "health",
    subjects: ["MED", "RAD", "BIOM", "PAE", "CLRE", "DDPM", "LHCO"],
  },

  // ── Rady ──────────────────────────────────────────────────────────────────
  { id: "management", name: "Management", schoolId: "rady", subjects: ["MGT", "MGTA", "MGTF", "MGTP"] },

  // ── Global Policy and Strategy ────────────────────────────────────────────
  {
    id: "global-policy", name: "Global Policy and Strategy", schoolId: "gps",
    subjects: ["GPCO", "GPEC", "GPGN", "GPIM", "GPLA", "GPPA", "GPPS"],
  },

  // ── Interdisciplinary and campus-wide ─────────────────────────────────────
  {
    id: "area-studies", name: "International and Area Studies", schoolId: "interdisciplinary",
    subjects: ["INTL", "LATI", "JAPN", "CHIN", "JUDA", "JWSP", "CLAS", "RELI", "GSS", "HMNR", "LAWS"],
  },
  {
    id: "environment", name: "Environmental Studies", schoolId: "interdisciplinary",
    subjects: ["ENVR", "ESYS", "CCS"],
  },
  {
    id: "writing-programs", name: "Writing Programs", schoolId: "interdisciplinary",
    subjects: ["AWP", "ELWR"],
  },
  {
    id: "campus-programs", name: "Campus-Wide Programs", schoolId: "interdisciplinary",
    subjects: ["AIP", "EAP", "CCE", "CONT", "COM GEN", "SDCC"],
  },
];

// ── Colleges — a separate axis ───────────────────────────────────────────────
// These set GE and writing requirements. They own no majors and no academic
// departments; the subjects below are their own core/writing sequences.

export const COLLEGE_UNITS: CollegeUnit[] = [
  { id: "revelle", name: "Revelle College", subjects: ["REV", "HUM"] },
  { id: "muir", name: "John Muir College", subjects: ["MUIR", "MCWP"] },
  { id: "marshall", name: "Thurgood Marshall College", subjects: ["TMC", "DOC"] },
  { id: "warren", name: "Earl Warren College", subjects: ["WARR", "WCWP", "WES"] },
  { id: "erc", name: "Eleanor Roosevelt College", subjects: ["ERC", "MMW"] },
  { id: "sixth", name: "Sixth College", subjects: ["SXTH", "CAT"] },
  { id: "seventh", name: "Seventh College", subjects: ["SEV", "SYN"] },
  { id: "eighth", name: "Eighth College", subjects: ["EIGHT"] },
];

// ── Lookups ──────────────────────────────────────────────────────────────────

const SUBJECT_TO_DEPT = new Map<string, Department>();
for (const d of DEPARTMENTS) for (const s of d.subjects) SUBJECT_TO_DEPT.set(s, d);

const SUBJECT_TO_COLLEGE = new Map<string, CollegeUnit>();
for (const c of COLLEGE_UNITS) for (const s of c.subjects) SUBJECT_TO_COLLEGE.set(s, c);

export const departmentForSubject = (code: string) => SUBJECT_TO_DEPT.get(code) ?? null;
export const collegeForSubject = (code: string) => SUBJECT_TO_COLLEGE.get(code) ?? null;

export const departmentById = (id: string) => DEPARTMENTS.find((d) => d.id === id) ?? null;
export const schoolById = (id: string) => SCHOOLS.find((s) => s.id === id) ?? null;
export const collegeById = (id: string) => COLLEGE_UNITS.find((c) => c.id === id) ?? null;

/** Subject codes not yet claimed by any department or college. */
export function unmappedSubjects(all: string[]): string[] {
  return all.filter((c) => !SUBJECT_TO_DEPT.has(c) && !SUBJECT_TO_COLLEGE.has(c));
}

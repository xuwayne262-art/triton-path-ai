#!/usr/bin/env node
/**
 * Builds the UCSDPlans course dataset from public UCSD sources.
 *
 *   as-grades.json     AS Instructor Grade Archive — 2015-2026 grade distributions (fetch-as-grades.mjs)
 *   catalog.json       catalog.ucsd.edu  — every catalogued course, its description
 *                      and prerequisites (fetch-catalog.mjs)
 *   classplanner.json  UCSD Class Planner — this term's sections, per-section
 *                      instructors, live seats, TSS module ids (fetch-classplanner.mjs)
 *   requirements.json  the campus-wide AHI and DEI course lists (fetch-requirements.mjs)
 *   data.json          ucsd-easy-a-radar — RateMyProfessors scores only
 *   ge-courses.json    ucsd-easy-a-radar — approved GE lists per UCSD college
 *                      Neither is downloaded any more (no licence). Without
 *                      them in .data-cache, their part of the published
 *                      dataset is carried over unchanged (readPublished).
 *
 * Emits into public/data/plat/:
 *   index.json          browse + search index (one row per catalog course)
 *   ge.json             college -> GE area -> course codes, plus the campus-wide
 *                       requirements under the pseudo-college "campus"
 *   buildings.json      building code -> name + coordinates, for the campus map
 *   subject/<SUB>.json  per-instructor grade distributions, each term's grades,
 *                       descriptions, the courses each one leads to, FA26 sections
 *
 * Run: npm run build:data
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".data-cache");
const OUT = path.join(ROOT, "public", "data", "plat");
const RAW = "https://raw.githubusercontent.com/Edwardwang66/ucsd-easy-a-radar/main";

const SOURCES = ["data.json", "ge-courses.json"];

// UCSD subject codes -> department names. Anything missing falls back to the code.
const SUBJECT_NAMES = {
  AAS: "African American Studies", ANAR: "Anthropological Archaeology",
  ANBI: "Biological Anthropology", ANSC: "Sociocultural Anthropology",
  ANTH: "Anthropology", ASTR: "Astronomy & Astrophysics", AUD: "Audiology",
  AWP: "Analytical Writing Program", BENG: "Bioengineering", BGGN: "Biology, Graduate",
  BICD: "Biology: Genetics, Cellular & Developmental", BIEB: "Biology: Ecology, Behavior & Evolution",
  BILD: "Biology, Lower Division", BIMM: "Biology: Molecular & Microbiology",
  BIPN: "Biology: Physiology & Neuroscience", BISP: "Biology: Special Studies",
  CAT: "Culture, Art & Technology (Sixth)", CCS: "Climate Change Studies",
  CENG: "Chemical Engineering", CGS: "Critical Gender Studies", CHEM: "Chemistry & Biochemistry",
  CHIN: "Chinese Studies", CLAS: "Classical Studies", CLIN: "Clinical Psychology",
  COGS: "Cognitive Science", COMM: "Communication", CONT: "Contemporary Issues",
  CSE: "Computer Science & Engineering", DOC: "Dimensions of Culture (Marshall)",
  DSC: "Data Science", DSGN: "Design", EDS: "Education Studies",
  ECE: "Electrical & Computer Engineering", ECON: "Economics", EIGHT: "Eighth College Core",
  ENG: "Engineering", ENVR: "Environmental Studies", ERC: "Eleanor Roosevelt College",
  ESYS: "Environmental Systems", ETHN: "Ethnic Studies", FILM: "Film Studies",
  FMPH: "Family Medicine & Public Health", FPMU: "Public Health", GLBH: "Global Health",
  GSS: "Global South Studies", HDS: "Human Developmental Sciences", HIAF: "History of Africa",
  HIEA: "History of East Asia", HIEU: "History of Europe",
  HILA: "History of Latin America", HILD: "History, Lower Division",
  HINE: "History of the Near East", HIS: "History", HISC: "History of Science",
  HITO: "History Topics", HIUS: "History of the United States", HLAW: "History of Law",
  HMNR: "Human Rights", HUM: "Humanities (Revelle)", INTL: "International Studies",
  JAPN: "Japanese Studies", JUDA: "Judaic Studies", LATI: "Latin American Studies",
  LAWS: "Law & Society", LIAB: "Linguistics: Arabic", LIDS: "Linguistics: Directed Study",
  LIFR: "Linguistics: French", LIGM: "Linguistics: German", LIGN: "Linguistics",
  LIHI: "Linguistics: Hindi", LIIT: "Linguistics: Italian", LIPO: "Linguistics: Portuguese",
  LISL: "Linguistics: American Sign Language", LISP: "Linguistics: Spanish",
  LIT: "Literature", LTAF: "Literature of Africa", LTAM: "Literature of the Americas",
  LTCH: "Chinese Literature", LTCO: "Literature/Comparative", LTCS: "Literature/Cultural Studies",
  LTEA: "East Asian Literature", LTEN: "English Literature", LTEU: "European Literature",
  LTFR: "French Literature", LTGK: "Greek Literature", LTGM: "German Literature",
  LTIT: "Italian Literature", LTKO: "Korean Literature", LTLA: "Latin Literature",
  LTRU: "Russian Literature", LTSP: "Spanish Literature", LTTH: "Literary Theory",
  LTWL: "Literature/World Literature", LTWR: "Literature/Writing",
  MAE: "Mechanical & Aerospace Engineering", MATH: "Mathematics", MATS: "Materials Science",
  MBC: "Marine Biodiversity & Conservation", MCWP: "Muir College Writing Program",
  MGT: "Rady School of Management", MMW: "Making of the Modern World (ERC)",
  MUIR: "Muir College", MUS: "Music", NANO: "NanoEngineering", PHIL: "Philosophy",
  PHYS: "Physics", POLI: "Political Science", PSYC: "Psychology", RELI: "Study of Religion",
  REV: "Revelle College", SE: "Structural Engineering", SIO: "Scripps Institution of Oceanography",
  SOCI: "Sociology", SOCG: "Sociology, Graduate", SPPS: "Skaggs Pharmacy",
  SYN: "Synthesis (Seventh)", TDAC: "Theatre: Acting", TDDE: "Theatre: Design",
  TDDR: "Theatre: Directing", TDGE: "Theatre: General", TDHD: "Theatre: History",
  TDHT: "Theatre History", TDMV: "Theatre: Movement", TDPF: "Theatre: Performance",
  TDPR: "Theatre: Practicum", TDTR: "Theatre & Dance", TMC: "Thurgood Marshall College",
  USP: "Urban Studies & Planning", VIS: "Visual Arts", WARR: "Warren College",
  WCWP: "Warren College Writing Program", WES: "Warren Ethics & Society",
  // Single-subject programs, named as the registrar lists them.
  AAPI: "Asian American and Pacific Islander Studies",
  AIP: "Academic Internship Program",
  CCE: "Critical Community Engagement",
  CLX: "Chicanx and Latinx Studies",
  CSS: "Computational Social Science",
  JWSP: "Jewish Studies",
  PH: "Public Health",
  // School of Medicine departments, named from their own course titles
  // ("Psychiatry Core Clerkship" is PSY, not PSYC's Psychology).
  ANES: "Anesthesiology", DERM: "Dermatology", EMED: "Emergency Medicine",
  OBG: "Obstetrics & Gynecology", OPTH: "Ophthalmology", ORTH: "Orthopaedic Surgery",
  PATH: "Pathology", PEDS: "Pediatrics", PHAR: "Pharmacology", PSY: "Psychiatry",
  RMAS: "Radiation Medicine & Applied Sciences", SURG: "Surgery", UROL: "Urology",
};

/**
 * Checks the first-party inputs are in .data-cache.
 *
 * ucsd-easy-a-radar's two files (SOURCES) carry no licence, so they are no
 * longer downloaded. A build uses the copies already in .data-cache when there
 * are any; without them it carries over what the published dataset already
 * holds (see readPublished) — which is how the automatic update in GitHub
 * Actions builds, since it never has those files.
 */
function checkInputs() {
  fs.mkdirSync(CACHE, { recursive: true });
  console.log(`  grades  ${path.relative(ROOT, gradesFile())}`);
  for (const [file, script] of [
    ["catalog.json", "fetch-catalog.mjs"],
    ["classplanner.json", "fetch-classplanner.mjs"],
  ]) {
    if (!fs.existsSync(path.join(CACHE, file))) {
      throw new Error(`missing .data-cache/${file} — run: node scripts/${script}`);
    }
  }
  for (const f of SOURCES) {
    console.log(cached(f) ? `  cached  ${f}` : `  carry   ${f} is not in .data-cache; carrying its part of the published dataset over (${RAW})`);
  }
}

const cached = (f) => fs.existsSync(path.join(CACHE, f)) && fs.statSync(path.join(CACHE, f)).size > 1000;

/**
 * The AS grade archive went behind UCSD's sign-in in October 2026, so its last
 * open harvest (Aug 23, 2026; 30,146 rows) is kept in the repository: a fresh
 * checkout — the automatic update's — builds from it. A harvest in .data-cache
 * with rows in it wins; replace the snapshot with it when there is a newer one.
 */
const GRADES_SNAPSHOT = path.join(ROOT, "data", "sources", "as-grades.json");
function gradesFile() {
  const local = path.join(CACHE, "as-grades.json");
  if (fs.existsSync(local) && (JSON.parse(fs.readFileSync(local, "utf8")).rows || []).length) return local;
  if (fs.existsSync(GRADES_SNAPSHOT)) return GRADES_SNAPSHOT;
  throw new Error("no grade archive: neither .data-cache/as-grades.json (node scripts/fetch-as-grades.mjs) nor data/sources/as-grades.json");
}
const readCache = (f) => JSON.parse(fs.readFileSync(path.join(CACHE, f), "utf8"));

/**
 * What the published dataset holds that a build without ucsd-easy-a-radar's
 * files carries over: the RateMyProfessors scores, the colleges' GE areas and
 * lists, and every course's prerequisite wording, which fills in where
 * neither the catalog nor Class Planner says anything — the part of data.json
 * the build used. Read before the build clears public/data/plat.
 *
 * Scores are kept per course and instructor, exactly as published, because a
 * name alone is not a person: two instructors the site shows under one name
 * would otherwise trade ratings. `byName` is the fallback for an instructor
 * the published dataset never paired with that course.
 */
function readPublished() {
  const ratings = new Map();
  const byName = new Map();
  const pre = {};
  const dir = path.join(OUT, "subject");
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
      const file = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      for (const [code, c] of Object.entries(file.courses || {})) {
        if (c.pre) pre[code] = c.pre;
        for (const p of c.profs || []) {
          if (!p.i) continue;
          // An unrated pair is kept too, as null: it stays unrated rather than
          // borrowing a rating through the name fallback.
          const rated = p.rq != null || p.rid != null;
          const rating = rated ? { rq: p.rq ?? null, rd: p.rd ?? null, rw: p.rw ?? null, rn: p.rn ?? null, rid: p.rid ?? null } : null;
          ratings.set(`${code}|${p.i}`, rating);
          if (rating && !byName.has(p.i)) byName.set(p.i, rating);
        }
      }
    }
  }
  const geFile = path.join(OUT, "ge.json");
  const ge = fs.existsSync(geFile) ? JSON.parse(fs.readFileSync(geFile, "utf8")) : null;
  return { ratings, byName, pre, ge };
}

/** Shared empty set, so a course with no scheduled instructor needs no branch. */
const EMPTY = new Set();

/**
 * Instructors the schedule lists by the name they go by while the grade
 * archive files them under their registered one. Without this, CSE 12 said
 * Paul Cao had "no published record" when he has fourteen graded terms of it
 * as Yingjun Cao, and BIPN 105 said the same of Chris Armour's twenty-six.
 *
 * Every pair was checked by hand, and only kept when the name they go by is
 * their middle name or a standard short form of their first (Peggy for
 * Margaret, Reza for Gholamreza), or is documented by the department (Paul
 * Cao). Pairs that merely share a surname and a course stay apart — Deepak
 * and Rakesh Kumar are two people — because giving one person another's
 * grades is worse than showing none.
 */
const PREFERRED_NAMES = {
  "Armour, Jon Christopher": "Chris Armour",
  "Butler, Elizabeth Annette": "Libby Butler",
  "Cao, Yingjun": "Paul Cao",
  "Chapman, Eddie Nathaniel": "Nathaniel Chapman",
  "Davis, Robert Martin": "Marty Davis",
  "Esmaili, Gholamreza": "Reza Esmaili",
  "Fox, Patrick Keolu Ozer": "Keolu Fox",
  "Hendrickson, Gerald M.": "Mark Hendrickson",
  "Lott, Margaret S.": "Peggy Lott",
  "Wagner, Timothy Ryan": "Ryan Wagner",
  "Wong, Thomas Hong Tsun": "Hong Tsun Wong",
};

/** "Porter, Matt J" -> "Matt J Porter" */
function registeredName(name) {
  if (!name || !name.includes(",")) return name || "TBA";
  const [last, first] = name.split(",").map((s) => s.trim());
  return `${first} ${last}`.trim();
}

/** The one name the site uses for a person: the name they go by, when we know it. */
function displayName(name) {
  return PREFERRED_NAMES[name] ?? registeredName(name);
}

/**
 * One key both name styles collapse to: the grade archive writes
 * "Politz, Joseph Gibbs" and the schedule writes "Joe Politz", so surname plus
 * first initial is the most the two reliably share. Comparing the raw strings
 * matches nothing at all, which is what silently emptied "teaching this term".
 */
function instructorKey(name) {
  if (!name) return "";
  const cleaned = String(name).toLowerCase().replace(/[^a-z, ]/g, " ");
  let last, first;
  if (cleaned.includes(",")) {
    const [tail, head] = cleaned.split(",");
    last = tail.trim().split(/\s+/).filter(Boolean).pop() || "";
    first = (head || "").trim().split(/\s+/).filter(Boolean)[0] || "";
  } else {
    const words = cleaned.trim().split(/\s+/).filter(Boolean);
    last = words[words.length - 1] || "";
    first = words[0] || "";
  }
  return last && first ? `${last}|${first[0]}` : "";
}

/** An archive name's key, under the name the person goes by. */
const archiveKey = (name) => instructorKey(PREFERRED_NAMES[name] ?? name);

// ── Prerequisite references ──────────────────────────────────────────────────

/**
 * Every course code a prerequisite sentence names.
 *
 * A bare number continues the subject before it when it follows "or", "and",
 * a comma or a slash — "CHEM 6A or 6AH", "MATH 10C or 20C or 31BH" — but not
 * in "a score of 5", where nothing joins it to a code. "20A–B" names 20A and
 * 20B. The app reads prerequisite text with the same rule, in
 * src/lib/prereqs.ts; a test holds the two to the same answers.
 */
function prereqCodes(text) {
  if (!text) return [];
  const out = new Set();
  const src = String(text).replace(/[–—]/g, "-");
  const CODE = /\b([A-Z]{2,5}) ?(\d{1,3}[A-Z]{0,3})((?:-[A-Z]{1,2}\b)*)/g;
  const MORE = /^\s*(?:,|\/|\bor\b|\band\b|,\s*or\b|,\s*and\b)\s*(\d{1,3}[A-Z]{0,3})\b(?!\s*(?:units?|years?|quarters?|%|or more|\())/;
  for (const m of src.matchAll(CODE)) {
    const [whole, sub, num, tail] = m;
    const digits = num.replace(/[A-Z]+$/, "");
    out.add(`${sub} ${num}`);
    for (const part of tail.split("-").filter(Boolean)) out.add(`${sub} ${digits}${part}`);
    let rest = src.slice(m.index + whole.length);
    for (let next = MORE.exec(rest); next; next = MORE.exec(rest)) {
      out.add(`${sub} ${next[1]}`);
      rest = rest.slice(next[0].length);
    }
  }
  return [...out];
}

/** Academic order within a year: winter, spring, summer, fall. */
const QUARTER_ORDER = { WI: 1, SP: 2, S1: 3, S2: 3, S3: 3, SU: 3, FA: 4 };
const termOrder = (yy, q) => Number(yy) * 10 + (QUARTER_ORDER[q] ?? 0);

/**
 * A final, a midterm, or any meeting pinned to a single date (its days column
 * holds the date). None of them is a weekly slot or a section to choose.
 */
const isOneOff = (s) => s[1] === "FI" || s[1] === "MI" || /^\d{4}-\d{2}-\d{2}$/.test(s[2] || "");

/** Numeric part of a course number so "CSE 8A" < "CSE 11" < "CSE 100". */
function courseNumOrder(num) {
  const m = /^(\d+)/.exec(num);
  return m ? Number(m[1]) : 9999;
}

/**
 * WebReg prints "Joe Politz" where the grade records say "Joseph Gibbs Politz",
 * so match on surname plus first initial. Getting this wrong pairs one
 * instructor's name with another's ratings, which is worse than showing nothing.
 */
function sameInstructor(a, b) {
  if (!a || !b) return false;
  const parts = (s) => s.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);
  const pa = parts(a), pb = parts(b);
  if (!pa.length || !pb.length) return false;
  if (pa[pa.length - 1] !== pb[pb.length - 1]) return false;
  return pa[0][0] === pb[0][0];
}

/**
 * The URL that opens one section on TSS, UCSD's enrolment system.
 *
 * This is the shape UCSD's own Class Planner hands out in `tss_booking_url`,
 * not a guess: the long zero runs are fixed padding in SAP's route, and the
 * trailing "/?" is part of it. Everything after the "#" is a client-side route,
 * so it must NOT be percent-encoded — SAP's router cannot match an escaped one.
 *
 * Returns "" unless every part is known. A URL with a missing id opens a TSS
 * error page, which is worse for a student than no link at all.
 */
function tssBookUrl(moduleId, packageId, year, period) {
  if (!moduleId || !packageId || !year || !period) return "";
  return "https://tss.ucsd.edu/fiori#ZUSModule-display?TileType=MYMOD"
    + `&/Detail/EventPackage/SM/${moduleId}/00000000/0/0/0`
    + `/00000000-0000-0000-0000-000000000000/${packageId}/${year}/${period}/?`;
}

/**
 * Folds the per-term AS Instructor Grade Archive rows into one record per
 * course x instructor — the grain the rest of this script expects.
 *
 * The GPA is averaged over the terms that actually reported one. Terms with no
 * published GPA (fully P/NP offerings, tiny sections the registrar suppresses)
 * carry a 0 in the archive, and averaging those in as if they were failing
 * quarters is what dragged CSE 191/Micciancio down to a "C-" when its one
 * graded term was a 3.88.
 */
/**
 * The archive sometimes files one person under two spellings — "Savage,
 * Stefan" and "Savage, Stefan Roberts" — which split their history into two
 * records on the same course. Spellings are one person when the surname and
 * first name match, the middle names agree wherever both give one (an initial
 * agrees with a name it starts), and they taught in a shared subject. A group
 * is only merged when every pair in it agrees, so a bare "John Smith" never
 * joins a John A. Smith to a John B. Smith. The spelling with the most history
 * names the person.
 *
 * Returns raw name -> the raw name it is filed under.
 */
function canonicalArchiveNames(rows) {
  const info = new Map();
  for (const r of rows) {
    const raw = r[5];
    if (!raw || !raw.includes(",")) continue;
    let e = info.get(raw);
    if (!e) {
      const [last, rest = ""] = raw.split(",").map((s) => s.toLowerCase().replace(/[^a-z ]/g, " ").trim());
      const words = rest.split(/\s+/).filter(Boolean);
      e = { last, first: words[0] || "", middles: words.slice(1), subs: new Set(), n: 0 };
      info.set(raw, e);
    }
    e.subs.add(r[0]);
    e.n++;
  }

  const agree = (a, b) => {
    if (!a.first || a.last !== b.last || a.first !== b.first) return false;
    const [short, long] = a.middles.length <= b.middles.length ? [a, b] : [b, a];
    return short.middles.every((m, i) => long.middles[i].startsWith(m) || m.startsWith(long.middles[i]));
  };

  const groups = new Map();
  for (const [raw, e] of info) {
    const k = `${e.last}|${e.first}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(raw);
  }

  const canon = new Map();
  for (const raws of groups.values()) {
    if (raws.length < 2) continue;
    // Link agreeing spellings that share a subject, then keep only groups in
    // which every pair agrees.
    const parent = new Map(raws.map((r) => [r, r]));
    const find = (r) => (parent.get(r) === r ? r : find(parent.get(r)));
    for (let i = 0; i < raws.length; i++) {
      for (let j = i + 1; j < raws.length; j++) {
        const a = info.get(raws[i]), b = info.get(raws[j]);
        if (agree(a, b) && [...a.subs].some((s) => b.subs.has(s))) parent.set(find(raws[i]), find(raws[j]));
      }
    }
    const clusters = new Map();
    for (const r of raws) {
      const root = find(r);
      if (!clusters.has(root)) clusters.set(root, []);
      clusters.get(root).push(r);
    }
    for (const members of clusters.values()) {
      if (members.length < 2) continue;
      const allAgree = members.every((a, i) => members.slice(i + 1).every((b) => agree(info.get(a), info.get(b))));
      if (!allAgree) continue;
      const name = [...members].sort((a, b) => info.get(b).n - info.get(a).n || b.length - a.length)[0];
      for (const m of members) if (m !== name) canon.set(m, name);
    }
  }
  return canon;
}

function foldAsGrades(as) {
  const byPair = new Map();
  const canon = canonicalArchiveNames(as.rows);

  for (const [sub, num, yy, , title, rawInstructor, gpa, A, B, C, D, F, W, P, NP] of as.rows) {
    const instructor = canon.get(rawInstructor) ?? rawInstructor;
    const key = `${sub} ${num}|${instructor}`;
    if (!byPair.has(key)) {
      byPair.set(key, {
        sub, num, instructor, title,
        terms: 0, gpaSum: 0, gpaTerms: 0, lastYear: null,
        A: 0, B: 0, C: 0, D: 0, F: 0, W: 0, P: 0, NP: 0,
      });
    }
    const p = byPair.get(key);
    p.terms++;
    if (gpa > 0) { p.gpaSum += gpa; p.gpaTerms++; }
    const y = Number(yy);
    if (Number.isFinite(y) && (p.lastYear == null || y > p.lastYear)) p.lastYear = y;
    p.A += A; p.B += B; p.C += C; p.D += D; p.F += F; p.W += W; p.P += P; p.NP += NP;
    if (title && title.length > p.title.length) p.title = title;
  }

  // Rebuilt in the column layout the downstream code indexes into, so the only
  // thing that changed is where the numbers came from.
  const cols = ["s", "c", "t", "i", "g", "gA", "gB", "gC", "gD", "gF", "gW", "gP", "gNP", "n", "y"];
  const titles = [];
  const titleIndex = new Map();
  const recs = [];

  for (const p of byPair.values()) {
    if (!titleIndex.has(p.title)) { titleIndex.set(p.title, titles.length); titles.push(p.title); }
    const avg = (v) => +(v / p.terms).toFixed(4);
    recs.push([
      p.sub, p.num, titleIndex.get(p.title), p.instructor,
      p.gpaTerms ? +(p.gpaSum / p.gpaTerms).toFixed(3) : 0,
      avg(p.A), avg(p.B), avg(p.C), avg(p.D), avg(p.F), avg(p.W), avg(p.P), avg(p.NP),
      p.terms, p.lastYear,
    ]);
  }

  return { cols, titles, recs, meta: as.meta, canon };
}

function build() {
  // Grades come straight from UCSD Associated Students' own archive; the
  // remaining extras (RateMyProfessors scores, prerequisites, seat links, FA26
  // instructor lists) still ride along in data.json and each need their own
  // first-party source before that file can be dropped entirely.
  const asGrades = JSON.parse(fs.readFileSync(gradesFile(), "utf8"));
  const extras = cached("data.json") ? readCache("data.json") : null;
  const catalog = readCache("catalog.json");
  const sched = readCache("classplanner.json");
  /**
   * Whether this harvest dates every section's seats (tuple position 20).
   * Older ones dated a whole course by whichever lecture they asked about,
   * which is not a time the course's other sections were counted at, so no
   * seat time at all is published from them.
   */
  const datedSeats = Array.isArray(sched.secCols) && sched.secCols.includes("seatsAt");
  if (!datedSeats) console.log("  classplanner.json predates per-section seat times — publishing seats undated (run: node scripts/fetch-classplanner.mjs)");
  const ge = cached("ge-courses.json") ? readCache("ge-courses.json") : null;
  const requirements = fs.existsSync(path.join(CACHE, "requirements.json")) ? readCache("requirements.json") : null;
  // Without ucsd-easy-a-radar's files, their part comes from what is published.
  const published = extras && ge ? null : readPublished();
  if (!ge && !published.ge) throw new Error("no .data-cache/ge-courses.json and no published ge.json to carry the GE lists over from");
  if (!requirements) console.log("  no requirements.json — building without the AHI and DEI lists (run: node scripts/fetch-requirements.mjs)");

  const grades = foldAsGrades(asGrades);
  const col = Object.fromEntries(grades.cols.map((c, i) => [c, i]));
  const titles = grades.titles;

  // RateMyProfessors scores are keyed by instructor, so they can be joined onto
  // the AS records without depending on that file's grade numbers.
  const rmp = new Map();
  // Same scores under the surname-plus-initial key, so an instructor reached
  // through the schedule's spelling ("Matt Porter") finds the record filed
  // under the archive's ("Porter, Matt J").
  const rmpByKey = new Map();
  if (extras) {
    const ec = Object.fromEntries(extras.cols.map((c, i) => [c, i]));
    for (const r of extras.recs) {
      const name = r[ec.i];
      if (!name || rmp.has(name)) continue;
      if (r[ec.rq] == null && r[ec.rid] == null) continue;
      const rec = {
        rq: r[ec.rq] ?? null, rd: r[ec.rd] ?? null,
        rw: r[ec.rw] ?? null, rn: r[ec.rn] ?? null, rid: r[ec.rid] ?? null,
      };
      rmp.set(name, rec);
      const key = instructorKey(name);
      // Only the first spelling claims a key: two different people who share a
      // surname and initial must not inherit each other's rating.
      if (key && !rmpByKey.has(key)) rmpByKey.set(key, rec);
    }
    console.log(`  joined RateMyProfessors scores for ${rmp.size} instructors`);
  } else {
    for (const [name, rec] of published.byName) {
      const key = instructorKey(name);
      if (key && !rmpByKey.has(key)) rmpByKey.set(key, rec);
    }
    console.log(`  carried RateMyProfessors scores for ${published.byName.size} instructors over from the published dataset`);
  }
  /**
   * A carried-over score for one course's instructor: exactly what was
   * published for that pair (none, if it was unrated), else that name's.
   * Nothing when data.json was read.
   */
  const carried = (code, name) => {
    if (extras) return undefined;
    const pair = `${code}|${name}`;
    return published.ratings.has(pair) ? published.ratings.get(pair) || undefined : published.byName.get(name);
  };
  /**
   * Who is teaching THIS course this term — course code -> instructor keys.
   *
   * This used to be one flat Set of every instructor teaching anything this
   * term, so `cur` answered "does this person teach something in FA26?" rather
   * than "do they teach THIS?". Every past instructor of a course who happened
   * to be on campus was badged "Teaching this term": BIEB 102 credited Sara
   * Jackrel and Jonathan Shurin, who teach other BIEB courses, while the person
   * actually running it — Michael Overton, on all five sections — was missing.
   *
   * Both spellings are indexed: the course's own instructor list and the name
   * on each section, because a course can have one instructor of record and a
   * different one on a lab.
   */
  const teachingThisTerm = new Map();
  for (const [code, s] of Object.entries(sched.courses)) {
    const keys = new Set();
    for (const name of s.inst || []) {
      const k = instructorKey(name);
      if (k) keys.add(k);
    }
    for (const t of s.sec || []) {
      const k = instructorKey(t[7]);
      if (k) keys.add(k);
    }
    if (keys.size) teachingThisTerm.set(code, keys);
  }

  // ── GE areas, as the lists publish them ───────────────────────────────────
  // Some colleges nest a level deeper (ERC "Regional Specialization" -> "Africa"),
  // so flatten those into "Area · Subarea". The codes are matched to courses
  // further down, once every source has been read.
  const geAreas = [];
  const geRaw = [];
  if (ge) {
    for (const [college, areas] of Object.entries(ge.colleges)) {
      for (const [area, value] of Object.entries(areas)) {
        const groups = Array.isArray(value)
          ? [[area, value]]
          : Object.entries(value).map(([sub, codes]) => [`${area} · ${sub}`, codes]);
        for (const [label, codes] of groups) {
          const key = `${college}:${label}`;
          geAreas.push({ key, college, area: label, n: codes.length });
          geRaw.push([key, codes]);
        }
      }
    }
  } else {
    // Carried over as published, less the campus-wide areas rebuilt below.
    for (const a of published.ge.areas) {
      if (a.college === "campus") continue;
      geAreas.push({ key: a.key, college: a.college, area: a.area, n: 0 });
      geRaw.push([a.key, published.ge.lists[a.key] || []]);
    }
    console.log(`  carried ${geAreas.length} college GE areas over from the published dataset`);
  }

  // ── course code -> record ─────────────────────────────────────────────────
  const byCourse = new Map();
  const upsert = (code) => {
    if (!byCourse.has(code)) {
      const sp = code.lastIndexOf(" ");
      byCourse.set(code, {
        code,
        sub: code.slice(0, sp),
        num: code.slice(sp + 1),
        title: "",
        units: "",
        profs: [],
        sec: [],
      });
    }
    return byCourse.get(code);
  };

  // The catalog is the roster of what exists. Seeding from it first means a
  // course keeps its entry through the quarters it is not offered and has no
  // grade history yet — which is most of the catalogue most of the time.
  for (const [code, , , title, units, prereq, description] of catalog.courses) {
    const c = upsert(code);
    c.title = title || "";
    c.units = units || "";
    if (prereq) c.pre = prereq;
    if (description) c.desc = description;
    c.inCatalog = 1;
  }

  /** Display name -> the registered spellings behind it, for the professor index. */
  const registeredAs = new Map();
  const noteSpelling = (shown, raw) => {
    const registered = registeredName(raw);
    if (registered === shown) return;
    if (!registeredAs.has(shown)) registeredAs.set(shown, new Set());
    registeredAs.get(shown).add(registered);
  };
  /** Archive name -> every spelling folded into it, so ratings filed under any of them are found. */
  const spellings = new Map();
  for (const [raw, name] of grades.canon) {
    if (!spellings.has(name)) spellings.set(name, []);
    spellings.get(name).push(raw);
    noteSpelling(displayName(name), raw);
  }

  for (const r of grades.recs) {
    const code = `${r[col.s]} ${r[col.c]}`;
    const c = upsert(code);
    const t = titles[r[col.t]];
    if (t && (!c.title || t.length > c.title.length)) c.title = t;
    const shown = displayName(r[col.i]);
    const rating = rmp.get(r[col.i])
      || (spellings.get(r[col.i]) || []).map((s) => rmp.get(s)).find(Boolean)
      || carried(code, shown)
      || {};
    noteSpelling(shown, r[col.i]);
    c.profs.push({
      i: shown,
      g: r[col.g] || 0,
      A: r[col.gA] || 0, B: r[col.gB] || 0, C: r[col.gC] || 0,
      D: r[col.gD] || 0, F: r[col.gF] || 0, W: r[col.gW] || 0,
      P: r[col.gP] || 0, NP: r[col.gNP] || 0,
      n: r[col.n] || 0,
      y: r[col.y] ?? null,
      cur: (teachingThisTerm.get(code) ?? EMPTY).has(archiveKey(r[col.i])) ? 1 : 0,
      rq: rating.rq ?? null, rd: rating.rd ?? null,
      rw: rating.rw ?? null, rn: rating.rn ?? null, rid: rating.rid ?? null,
    });
  }

  /**
   * Each term's grades, kept term by term so a page can show whether a course
   * or a professor has been getting harder — the archive publishes one row per
   * course x instructor x quarter, and the loop above folds them together.
   */
  const termRows = new Map();
  for (const [sub, num, yy, q, , instructor, gpa, A, B, C, D, F, W, P, NP] of asGrades.rows) {
    const code = `${sub} ${num}`;
    if (!termRows.has(code)) termRows.set(code, []);
    // One decimal is all a chart can show, and it halves the file.
    const pct = (v) => Math.round((v || 0) * 10) / 10;
    termRows.get(code).push({
      yy, q, who: displayName(grades.canon.get(instructor) ?? instructor),
      gpa: gpa > 0 ? +gpa.toFixed(2) : null,
      grades: [A, B, C, D, F, W, P, NP].map(pct),
    });
  }

  // ── This term's schedule: authoritative titles, units, sections ───────────
  // Class Planner is the term's system of record, so where it and the general
  // catalog disagree about what is running, it wins.
  let newlyNamed = 0;
  for (const [code, s] of Object.entries(sched.courses)) {
    const c = upsert(code);
    if (s.t && s.t.length > c.title.length) c.title = s.t;
    c.units = s.u || "";
    c.sec = s.sec || [];
    c.offered = 1;
    c.faInstructors = s.inst || [];
    if (s.res) c.res = s.res;
    if (datedSeats && s.seatsAt) c.seatsAt = s.seatsAt;

    // "Book on TSS" for the course: the enrollable section's package, because
    // TSS books a package (lecture + its discussion), not a bare lecture.
    const booking = (s.sections || []).find((x) => x.pkg && x.pkg.length === 1)
      || (s.sections || []).find((x) => x.pkg && x.pkg.length);
    c.tss = tssBookUrl(
      s.tssModule,
      booking && booking.pkg ? booking.pkg[0] : null,
      sched.tss && sched.tss.year,
      sched.tss && sched.tss.period,
    ) || null;
    if (c.tss) c.seatUrl = c.tss;
    // The registrar's own prerequisite wording, for the courses the general
    // catalog left blank.
    if (!c.pre && s.pre) c.pre = s.pre;

    /**
     * An instructor new to a course has no row in the grade archive, so the
     * grades loop above never created a record for them and "Teaching this
     * term" would come up empty — which is how a stale name got shown instead.
     * Give them a record carrying zero terms: the page can then name the right
     * person and say plainly that there is no history yet, rather than
     * substituting somebody else's.
     */
    for (const name of s.inst || []) {
      const key = instructorKey(name);
      if (!key || c.profs.some((p) => instructorKey(p.i) === key)) continue;
      const pair = `${code}|${name}`;
      const rating = (!extras && published.ratings.has(pair) ? published.ratings.get(pair) : rmpByKey.get(key)) || {};
      c.profs.push({
        i: name,
        g: 0, A: 0, B: 0, C: 0, D: 0, F: 0, W: 0, P: 0, NP: 0,
        n: 0, y: null, cur: 1,
        rq: rating.rq ?? null, rd: rating.rd ?? null,
        rw: rating.rw ?? null, rn: rating.rn ?? null, rid: rating.rid ?? null,
      });
      newlyNamed++;
    }
  }
  console.log(`  named ${newlyNamed} scheduled instructors with no grade history for their course`);

  // ── prerequisites ─────────────────────────────────────────────────────────
  // Prerequisites ride along on the catalog entries above, then Class Planner's
  // wording fills what the catalog left blank; data.json is only consulted for
  // courses neither of those lists any more.
  for (const [code, text] of Object.entries((extras ? extras.pre : published.pre) || {})) {
    const c = byCourse.get(code);
    if (c && !c.pre) c.pre = text;
  }
  // Seat links and this term's instructor lists used to come from data.json.
  // Both now come from Class Planner in the schedule loop above — the seat link
  // as a real TSS booking URL, the instructors per course rather than per term.

  // ── Campus-wide requirements ──────────────────────────────────────────────
  // Every undergraduate also owes American History & Institutions and DEI,
  // whatever their college. They travel as GE areas of a pseudo-college,
  // "campus", so a course page lists them with the rest and the GE page can
  // look for a course that clears a college area and one of these at once.
  if (requirements) {
    const ahi = new Set(requirements.ahi.codes);
    // "Any course listed under HIUS (other than HIUS colloquia)" — the
    // requirement is an undergraduate one, so graduate numbers are left out.
    for (const sub of requirements.ahi.anyUnder || []) {
      for (const c of byCourse.values()) {
        if (c.sub !== sub || !c.inCatalog || courseNumOrder(c.num) >= 200) continue;
        if (/colloqui/i.test(`${c.title} ${c.desc || ""}`)) continue;
        ahi.add(c.code);
      }
    }
    for (const [key, area, codes] of [
      ["campus:AHI", "American History & Institutions (AHI)", [...ahi]],
      ["campus:DEI", "Diversity, Equity & Inclusion (DEI)", requirements.dei.codes],
    ]) {
      geAreas.push({ key, college: "campus", area, n: codes.length });
      geRaw.push([key, codes]);
    }
    console.log(`  AHI ${ahi.size} courses, DEI ${requirements.dei.codes.length} courses`);
  }

  // ── GE list codes -> courses ──────────────────────────────────────────────
  // A list can name a course by a code UCSD has since changed. Political Science
  // added a "D" to its lower-division numbers, so a list still saying "POLI 13R"
  // meant POLI 13DR — and matching the text exactly dropped the course from
  // Eighth College's social-science breadth without a word. A code that matches
  // no course therefore tries its "D" form. A code that still matches nothing is
  // kept: the GE page lists it as approved-but-unknown rather than leave it out.
  const resolveGe = (code) => {
    if (byCourse.has(code)) return code;
    const withD = code.replace(/^(\S+ \d+)/, "$1D");
    return byCourse.has(withD) ? withD : code;
  };
  const geByCourse = new Map();
  const geLists = {};
  const renamed = new Set();
  for (const [key, codes] of geRaw) {
    const list = [...new Set(codes.map((code) => {
      const to = resolveGe(code);
      if (to !== code) renamed.add(`${code} -> ${to}`);
      return to;
    }))];
    geLists[key] = list;
    for (const code of list) {
      if (!geByCourse.has(code)) geByCourse.set(code, []);
      geByCourse.get(code).push(key);
    }
  }
  for (const area of geAreas) area.n = geLists[area.key].length;
  const unknownGe = new Set(Object.values(geLists).flat().filter((code) => !byCourse.has(code)));
  console.log(`  GE codes renumbered: ${[...renamed].join(", ") || "none"}`);
  console.log(`  GE codes with no course anywhere: ${[...unknownGe].join(", ") || "none"}`);

  // ── What each course leads to ─────────────────────────────────────────────
  // The reverse of every prerequisite sentence: CSE 12 leads to each course
  // whose prerequisites name it, alone or as one option. Only courses that are
  // current (in the catalog or on the schedule) count, since pointing a
  // student at a retired course helps nobody.
  const leadsTo = new Map();
  for (const c of byCourse.values()) {
    if (!c.inCatalog && !c.offered) continue;
    for (const ref of prereqCodes(c.pre)) {
      if (ref === c.code || !byCourse.has(ref)) continue;
      if (!leadsTo.has(ref)) leadsTo.set(ref, new Set());
      leadsTo.get(ref).add(c.code);
    }
  }
  const byCode = (a, b) => {
    const [sa, na] = [a.slice(0, a.lastIndexOf(" ")), a.slice(a.lastIndexOf(" ") + 1)];
    const [sb, nb] = [b.slice(0, b.lastIndexOf(" ")), b.slice(b.lastIndexOf(" ") + 1)];
    return sa.localeCompare(sb) || courseNumOrder(na) - courseNumOrder(nb) || na.localeCompare(nb);
  };

  // ── derive aggregates ─────────────────────────────────────────────────────
  const index = [];
  const bySubject = new Map();

  for (const c of byCourse.values()) {
    c.ge = geByCourse.get(c.code) || [];

    // Weighted by graded terms so a 30-term lecturer outweighs a one-off TA.
    let wGpa = 0, wA = 0, gpaW = 0, terms = 0, allW = 0;
    for (const p of c.profs) {
      const weight = Math.max(p.n, 1);
      allW += weight;
      terms += p.n;
      if (p.g > 0) { wGpa += p.g * weight; gpaW += weight; }
      if (p.A > 0) wA += p.A * weight;
    }
    c.gpa = gpaW ? +(wGpa / gpaW).toFixed(3) : null;
    c.aRate = allW && wA ? +(wA / allW).toFixed(1) : null;
    c.terms = terms;

    // Current FA26 instructors first, then the most-experienced.
    c.profs.sort((a, b) => (b.cur - a.cur) || (b.n - a.n) || (b.g - a.g));

    // Term rows point at their instructor by position in `profs`, newest term
    // first: [term, instructor index, GPA, A, B, C, D, F, W, P, NP].
    const at = new Map();
    c.profs.forEach((p, i) => { if (!at.has(p.i)) at.set(p.i, i); });
    c.hist = (termRows.get(c.code) || [])
      .filter((r) => at.has(r.who))
      .sort((a, b) => termOrder(b.yy, b.q) - termOrder(a.yy, a.q) || a.who.localeCompare(b.who))
      .map((r) => [`${r.q}${r.yy}`, at.get(r.who), r.gpa, ...r.grades]);

    // Primary meeting = first weekly section that actually has a time.
    const lec = c.sec.find((s) => !isOneOff(s) && s[2] && s[3]) || null;

    // Class Planner counts a lecture's students on the lecture itself, and each
    // of them again on their discussion, so adding every section counted CSE
    // 11's open seats twice ("80 left" when lecture B had 40). Lectures are
    // summed when a course has them, every other section when it has none —
    // the rule src/lib/seats/tally.ts uses on the course page — once each,
    // since a section meeting in two weekly patterns arrives as two rows.
    let seatsAvail = null, seatsLimit = null;
    const counted = new Set();
    const live = c.sec.filter((s) => !isOneOff(s) && s[10] !== 1 && s[9] != null);
    const pool = live.some((s) => s[1] === "LE") ? live.filter((s) => s[1] === "LE") : live;
    /** When each summed section's seats were counted; a missing one leaves the sum's time to the course. */
    const poolTimes = [];
    let undated = false;
    for (const s of pool) {
      const id = s[13] || `${s[0]}|${s[1]}`;
      if (counted.has(id)) continue;
      counted.add(id);
      seatsAvail = (seatsAvail ?? 0) + Math.max(0, s[8] ?? 0);
      seatsLimit = (seatsLimit ?? 0) + s[9];
      if (typeof s[20] === "string" && s[20]) poolTimes.push(s[20]);
      else undated = true;
    }
    // The "N left" a list shows is only as fresh as the oldest count in it. A
    // summed section with no time of its own falls back on the course's
    // oldest count, which Class Planner states across all of its sections —
    // never on a sibling's newer one.
    const seatsTime = !datedSeats || seatsLimit == null
      ? null
      : [...poolTimes, undated ? c.seatsAt : null].filter(Boolean).sort()[0] || null;

    const curProf = c.profs.find((p) => p.cur) || null;
    const schedProf = (lec && lec[7]) || (c.faInstructors && c.faInstructors[0]) || null;

    // Every p* field below must describe the person named in `p`, so resolve the
    // scheduled instructor back to their own grade record before reading ratings.
    const shown = (schedProf && c.profs.find((p) => sameInstructor(p.i, schedProf))) || curProf;

    index.push({
      k: c.code,
      s: c.sub,
      c: c.num,
      t: c.title,
      u: c.units || null,
      g: c.gpa,
      a: c.aRate,
      r: c.terms,
      o: c.offered ? 1 : 0,
      pr: c.pre ? 1 : 0,
      // Only a course the catalog does not list says so. Off the schedule too,
      // it is retired or renumbered, and its prerequisites are unknown — `pr: 0`
      // there means "no record", not "none".
      ...(c.inCatalog ? {} : { ct: 0 }),
      ge: c.ge.length ? c.ge : undefined,
      sa: seatsAvail,
      sl: seatsLimit,
      // When the oldest of those seats was counted, "2026-09-21T13:01Z"; only
      // on a row whose count Class Planner dated.
      ...(seatsTime ? { sat: seatsTime } : {}),
      d: lec ? lec[2] : null,
      st: lec ? lec[3] : null,
      en: lec ? lec[4] : null,
      b: lec ? lec[5] || null : null,
      p: schedProf || (shown ? shown.i : null),
      pq: shown ? shown.rq : null,
      pn: shown ? shown.rn : null,
      pa: shown ? shown.A || null : null,
      pd: shown ? shown.rd : null,
      pg: shown && shown.g > 0 ? shown.g : null,
    });

    if (!bySubject.has(c.sub)) bySubject.set(c.sub, {});
    bySubject.get(c.sub)[c.code] = {
      t: c.title,
      u: c.units || null,
      desc: c.desc || null,
      pre: c.pre || null,
      unl: [...(leadsTo.get(c.code) || [])].sort(byCode),
      hist: c.hist,
      ge: c.ge,
      gpa: c.gpa,
      aRate: c.aRate,
      terms: c.terms,
      offered: c.offered ? 1 : 0,
      seatUrl: c.seatUrl || null,
      tss: c.tss || null,
      res: c.res || null,
      fa: c.faInstructors || [],
      // When Class Planner last counted this course's seats; only on a course
      // it said so for, so older readers and smaller files see nothing new.
      ...(c.seatsAt ? { seatsAt: c.seatsAt } : {}),
      profs: c.profs,
      sec: c.sec,
    };
  }

  index.sort((a, b) =>
    a.s.localeCompare(b.s) ||
    courseNumOrder(a.c) - courseNumOrder(b.c) ||
    a.c.localeCompare(b.c)
  );

  const subjects = [...bySubject.entries()]
    .map(([code, courses]) => ({
      code,
      name: SUBJECT_NAMES[code] || code,
      n: Object.keys(courses).length,
      offered: Object.values(courses).filter((c) => c.offered).length,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  // The span of seat counts on the schedule: Class Planner recounts sections
  // on its own clock, so one dataset holds counts weeks apart, and no single
  // date can stand for all of them.
  const seatTimes = datedSeats
    ? Object.values(sched.courses).flatMap((s) => [s.seatsAt, ...(s.sec || []).map((t) => t[20])]).filter(Boolean).sort()
    : [];
  const seatsAsOf = seatTimes[0] || null;
  const seatsNewest = seatTimes[seatTimes.length - 1] || null;

  // ── write ─────────────────────────────────────────────────────────────────
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "subject"), { recursive: true });

  const meta = {
    term: sched.term,
    termName: sched.termName,
    generated: grades.meta.retrieved,
    years: grades.meta.years,
    gradeRecords: grades.recs.length,
    gradeTerms: grades.meta.rows,
    catalogCourses: index.length,
    offered: index.filter((c) => c.o).length,
    refreshed: sched.refreshed || null,
    // When this build read Class Planner. Not a seat time: re-reading counts
    // UCSD has not redone makes nothing fresher, so pages never date seats by it.
    ...(sched.generated ? { retrieved: sched.generated } : {}),
    // The oldest and newest seat counts on the schedule: the range "seats as
    // of" can honestly claim for the term as a whole. Each section carries its
    // own time (tuple position 20) and each list row the oldest it sums (`sat`).
    ...(seatsAsOf ? { seatsAsOf } : {}),
    ...(seatsNewest ? { seatsNewest } : {}),
    // Class Planner's own count of the term's listings, for the automatic
    // update to tell new or withdrawn courses and sections from a quiet day.
    ...(sched.counts ? { counts: sched.counts } : {}),
    sources: [
      `${grades.meta.source} (${grades.meta.url}) — ${grades.meta.years} grade distributions`,
      `${sched.source} — ${Object.keys(sched.courses).length} courses offered in ${sched.termName}, refreshed ${sched.refreshed || "unknown"}`,
      `${catalog.meta.source} (${catalog.meta.url}) — ${catalog.meta.courses} courses, ${catalog.meta.withPrereq} with prerequisites`,
      // Carried-over scores came the same way.
      (extras || published.byName.size) && "RateMyProfessors scores via data.json",
    ].filter(Boolean),
  };

  const write = (rel, obj) => {
    const p = path.join(OUT, rel);
    fs.writeFileSync(p, JSON.stringify(obj));
    return fs.statSync(p).size;
  };

  // ── Professor index ───────────────────────────────────────────────────────
  // Search previously only knew instructors named on this term's schedule, so
  // roughly four in five professors in the grade history were unfindable. This
  // indexes every instructor who has ever appeared, with the courses they
  // taught, and records the schedule's spelling of their name as an alias so
  // "Joe Politz" and "Joseph Gibbs Politz" both resolve.
  const profMap = new Map();
  for (const c of byCourse.values()) {
    for (const p of c.profs) {
      let rec = profMap.get(p.i);
      if (!rec) {
        rec = {
          n: p.i, aliases: new Set(),
          q: p.rq ?? null, nr: p.rn ?? null, d: p.rd ?? null, w: p.rw ?? null,
          id: p.rid ?? null, cur: 0, terms: 0, courses: [],
        };
        profMap.set(p.i, rec);
      }
      // Keep the richest RateMyProfessors record we see for this person.
      if ((p.rn ?? 0) > (rec.nr ?? 0)) {
        rec.q = p.rq ?? null; rec.nr = p.rn ?? null;
        rec.d = p.rd ?? null; rec.w = p.rw ?? null; rec.id = p.rid ?? null;
      }
      if (p.cur) rec.cur = 1;
      rec.terms += p.n;
      rec.courses.push([c.code, p.g > 0 ? p.g : null, p.n, p.cur ? 1 : 0, p.A || null]);
      const sched = (c.sec.find((x) => x[1] !== "FI" && x[7]) || [])[7];
      if (sched && sameInstructor(p.i, sched) && sched !== p.i) rec.aliases.add(sched);
      for (const fa of c.faInstructors || []) {
        if (sameInstructor(p.i, fa) && fa !== p.i) rec.aliases.add(fa);
      }
    }
  }

  // Someone shown under the name they go by is still findable by the one the
  // registrar files them under.
  for (const [shown, names] of registeredAs) {
    const rec = profMap.get(shown);
    if (rec) for (const n of names) rec.aliases.add(n);
  }

  // The source lists some instructors twice — once under the schedule's short
  // spelling with no grade history, once under the full name that carries it.
  // Fold the empty one into the real record so a search for "Politz" returns one
  // person, not two. Only records with no grade history are folded, so two
  // genuinely different people who share a surname and initial stay separate.
  // Surname and initial alone are not enough across the whole campus: they
  // folded Penghui Cao (MAE) into Paul Cao (CSE). The first names must also
  // agree — one a short form of the other ("Joe", "Joseph") or sharing their
  // opening letters.
  const firstName = (n) => n.toLowerCase().replace(/[^a-z ]/g, " ").trim().split(/\s+/)[0] || "";
  const sameFirst = (a, b) => {
    const x = firstName(a), y = firstName(b);
    return x.startsWith(y) || y.startsWith(x) || x.slice(0, 2) === y.slice(0, 2);
  };
  // A spelling that only drops middle names ("Andrea Carter" for "Andrea L
  // Carter") is the strongest match of all, so it is tried first; only when
  // there is no such record does the looser surname-and-initial rule apply.
  const words = (n) => n.toLowerCase().replace(/[^a-z ]/g, " ").trim().split(/\s+/).filter(Boolean);
  const dropsMiddles = (short, long) => {
    const s = words(short), l = words(long);
    return s.length < l.length && s[0] === l[0] && s[s.length - 1] === l[l.length - 1]
      && s.slice(1, -1).every((m) => l.slice(1, -1).some((x) => x.startsWith(m)));
  };
  for (const rec of [...profMap.values()]) {
    if (rec.terms > 0) continue;
    const others = [...profMap.values()].filter((o) => o !== rec && o.terms > 0);
    const exact = others.filter((o) => dropsMiddles(rec.n, o.n));
    const matches = exact.length
      ? exact
      : others.filter((o) => sameInstructor(o.n, rec.n) && sameFirst(o.n, rec.n));
    if (matches.length !== 1) continue;
    const target = matches[0];
    target.aliases.add(rec.n);
    for (const a of rec.aliases) target.aliases.add(a);
    if (rec.cur) target.cur = 1;
    for (const row of rec.courses) {
      if (!target.courses.some((x) => x[0] === row[0])) target.courses.push(row);
    }
    profMap.delete(rec.n);
  }

  const professors = [...profMap.values()]
    .map((r) => {
      // Weighted mean GPA across everything they have taught.
      let num = 0, den = 0;
      for (const [, gpa, terms] of r.courses) {
        if (gpa == null) continue;
        const wgt = Math.max(terms, 1);
        num += gpa * wgt; den += wgt;
      }
      r.courses.sort((a, b) => b[3] - a[3] || b[2] - a[2]);
      return {
        n: r.n,
        a: r.aliases.size ? [...r.aliases] : undefined,
        q: r.q, nr: r.nr, d: r.d, w: r.w, id: r.id,
        cur: r.cur, terms: r.terms,
        gpa: den ? +(num / den).toFixed(3) : null,
        c: r.courses,
      };
    })
    .sort((a, b) => a.n.localeCompare(b.n));

  // ── Campus buildings ──────────────────────────────────────────────────────
  // Keyed by building code, the one key a section's room ("CENTR 214"), its
  // meeting and UCSD's map all share. A cache from before codes were recorded
  // is keyed by display name, which does not match a section's building, so it
  // is skipped with a nudge rather than published half-joined.
  const buildings = {};
  for (const [code, b] of Object.entries(sched.buildings || {})) {
    if (!b || Array.isArray(b) || !Array.isArray(b.ll)) continue;
    buildings[code] = {
      n: b.name,
      ...(b.map ? { m: b.map } : {}),
      ll: b.ll,
      ...(b.address ? { a: b.address } : {}),
    };
  }
  if (!Object.keys(buildings).length) {
    console.log("  no building codes in classplanner.json — run: node scripts/fetch-classplanner.mjs");
  }

  const sizeIndex = write("index.json", { meta, subjects, courses: index });
  // A carried-over meta keeps the published list's date and note; the campus
  // part is rebuilt from requirements.json either way.
  const listMeta = ge ? ge.meta : { ...published.ge.meta };
  if (!ge) delete listMeta.campus;
  const geMeta = {
    ...listMeta,
    ...(requirements
      ? {
        campus: {
          ahi: { source: requirements.ahi.source, url: requirements.ahi.url, retrieved: requirements.ahi.retrieved, note: requirements.ahi.note },
          dei: {
            source: requirements.dei.source, url: requirements.dei.url, retrieved: requirements.dei.retrieved,
            termUrl: requirements.dei.termUrl, termName: requirements.dei.term.name, asOf: requirements.dei.term.asOf,
          },
        },
      }
      : {}),
  };
  const sizeGe = write("ge.json", { meta: geMeta, areas: geAreas, lists: geLists });
  const sizeBuildings = write("buildings.json", { term: sched.term, buildings });
  const sizeProfs = write("professors.json", { meta: { term: sched.term }, professors });
  let sizeSubjects = 0;
  for (const [sub, courses] of bySubject) {
    sizeSubjects += write(path.join("subject", `${sub}.json`), {
      code: sub,
      name: SUBJECT_NAMES[sub] || sub,
      term: sched.term,
      termName: sched.termName,
      courses,
    });
  }

  const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
  console.log(`\n  index.json      ${index.length} courses    ${mb(sizeIndex)}`);
  console.log(`  ge.json         ${geAreas.length} GE areas    ${mb(sizeGe)}`);
  console.log(`  buildings.json  ${Object.keys(buildings).length} buildings  ${mb(sizeBuildings)}`);
  console.log(`  professors.json ${professors.length} instructors ${mb(sizeProfs)}`);
  console.log(`  subject/*.json  ${bySubject.size} subjects   ${mb(sizeSubjects)}`);
  console.log(`  ${meta.offered} offered in ${meta.termName} · ${meta.gradeRecords} grade records\n`);
}

console.log("Building UCSDPlans dataset\n");
checkInputs();
build();
console.log("Done.");

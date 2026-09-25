#!/usr/bin/env node
/**
 * Builds the UCSDPlans course dataset from public UCSD sources.
 *
 *   as-grades.json     AS Instructor Grade Archive — 2015-2026 grade distributions (fetch-as-grades.mjs)
 *   catalog.json       catalog.ucsd.edu  — every catalogued course + prerequisites (fetch-catalog.mjs)
 *   classplanner.json  UCSD Class Planner — this term's sections, per-section
 *                      instructors, live seats, TSS module ids (fetch-classplanner.mjs)
 *   data.json          ucsd-easy-a-radar — RateMyProfessors scores only
 *   ge-courses.json    ucsd-easy-a-radar — approved GE lists per UCSD college
 *
 * Emits into public/data/plat/:
 *   index.json          browse + search index (one row per catalog course)
 *   ge.json             college -> GE area -> course codes
 *   subject/<SUB>.json  per-instructor grade distributions + FA26 sections
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
};

async function download() {
  fs.mkdirSync(CACHE, { recursive: true });
  for (const [file, script] of [
    ["as-grades.json", "fetch-as-grades.mjs"],
    ["catalog.json", "fetch-catalog.mjs"],
    ["classplanner.json", "fetch-classplanner.mjs"],
  ]) {
    if (!fs.existsSync(path.join(CACHE, file))) {
      throw new Error(`missing .data-cache/${file} — run: node scripts/${script}`);
    }
  }
  for (const f of SOURCES) {
    const dest = path.join(CACHE, f);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      console.log(`  cached  ${f}`);
      continue;
    }
    process.stdout.write(`  fetch   ${f} ... `);
    const res = await fetch(`${RAW}/${f}`);
    if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    console.log(`${(buf.length / 1024 / 1024).toFixed(2)} MB`);
  }
}

const readCache = (f) => JSON.parse(fs.readFileSync(path.join(CACHE, f), "utf8"));

/** Shared empty set, so a course with no scheduled instructor needs no branch. */
const EMPTY = new Set();

/** "Porter, Matt J" -> "Matt J Porter" */
function displayName(name) {
  if (!name || !name.includes(",")) return name || "TBA";
  const [last, first] = name.split(",").map((s) => s.trim());
  return `${first} ${last}`.trim();
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
function foldAsGrades(as) {
  const byPair = new Map();

  for (const [sub, num, yy, , title, instructor, gpa, A, B, C, D, F, W, P, NP] of as.rows) {
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

  return { cols, titles, recs, meta: as.meta };
}

function build() {
  // Grades come straight from UCSD Associated Students' own archive; the
  // remaining extras (RateMyProfessors scores, prerequisites, seat links, FA26
  // instructor lists) still ride along in data.json and each need their own
  // first-party source before that file can be dropped entirely.
  const asGrades = readCache("as-grades.json");
  const extras = fs.existsSync(path.join(CACHE, "data.json")) ? readCache("data.json") : null;
  const catalog = readCache("catalog.json");
  const sched = readCache("classplanner.json");
  const ge = readCache("ge-courses.json");

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
    console.log("  no data.json — building without RateMyProfessors, prereqs or seat links");
  }
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

  // ── course code -> GE areas it satisfies ──────────────────────────────────
  // Some colleges nest a level deeper (ERC "Regional Specialization" -> "Africa"),
  // so flatten those into "Area · Subarea".
  const geByCourse = new Map();
  const geAreas = [];
  const geLists = {};
  for (const [college, areas] of Object.entries(ge.colleges)) {
    for (const [area, value] of Object.entries(areas)) {
      const groups = Array.isArray(value)
        ? [[area, value]]
        : Object.entries(value).map(([sub, codes]) => [`${area} · ${sub}`, codes]);
      for (const [label, codes] of groups) {
        const key = `${college}:${label}`;
        geAreas.push({ key, college, area: label, n: codes.length });
        geLists[key] = codes;
        for (const code of codes) {
          if (!geByCourse.has(code)) geByCourse.set(code, []);
          geByCourse.get(code).push(key);
        }
      }
    }
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
  for (const [code, , , title, units, prereq] of catalog.courses) {
    const c = upsert(code);
    c.title = title || "";
    c.units = units || "";
    if (prereq) c.pre = prereq;
    c.inCatalog = 1;
  }

  for (const r of grades.recs) {
    const code = `${r[col.s]} ${r[col.c]}`;
    const c = upsert(code);
    const t = titles[r[col.t]];
    if (t && (!c.title || t.length > c.title.length)) c.title = t;
    const rating = rmp.get(r[col.i]) || {};
    c.profs.push({
      i: displayName(r[col.i]),
      g: r[col.g] || 0,
      A: r[col.gA] || 0, B: r[col.gB] || 0, C: r[col.gC] || 0,
      D: r[col.gD] || 0, F: r[col.gF] || 0, W: r[col.gW] || 0,
      P: r[col.gP] || 0, NP: r[col.gNP] || 0,
      n: r[col.n] || 0,
      y: r[col.y] ?? null,
      cur: (teachingThisTerm.get(code) ?? EMPTY).has(instructorKey(r[col.i])) ? 1 : 0,
      rq: rating.rq ?? null, rd: rating.rd ?? null,
      rw: rating.rw ?? null, rn: rating.rn ?? null, rid: rating.rid ?? null,
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
      const rating = rmpByKey.get(key) || {};
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
  for (const [code, text] of Object.entries((extras && extras.pre) || {})) {
    const c = byCourse.get(code);
    if (c && !c.pre) c.pre = text;
  }
  // Seat links and this term's instructor lists used to come from data.json.
  // Both now come from Class Planner in the schedule loop above — the seat link
  // as a real TSS booking URL, the instructors per course rather than per term.

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

    // Primary meeting = first non-final section that actually has a time.
    const lec = c.sec.find((s) => s[1] !== "FI" && s[2] && s[3]) || null;

    // Seats live on the enrollable sections (discussions/labs), not the lecture,
    // so total them across every non-exam section.
    let seatsAvail = null, seatsLimit = null;
    for (const s of c.sec) {
      if (s[1] === "FI" || s[1] === "MI" || s[9] == null) continue;
      seatsAvail = (seatsAvail ?? 0) + (s[8] ?? 0);
      seatsLimit = (seatsLimit ?? 0) + s[9];
    }

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
      ge: c.ge.length ? c.ge : undefined,
      sa: seatsAvail,
      sl: seatsLimit,
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
      pre: c.pre || null,
      ge: c.ge,
      gpa: c.gpa,
      aRate: c.aRate,
      terms: c.terms,
      offered: c.offered ? 1 : 0,
      seatUrl: c.seatUrl || null,
      tss: c.tss || null,
      res: c.res || null,
      fa: c.faInstructors || [],
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
    buildings: sched.buildings,
    refreshed: sched.refreshed || null,
    sources: [
      `${grades.meta.source} (${grades.meta.url}) — ${grades.meta.years} grade distributions`,
      `${sched.source} — ${Object.keys(sched.courses).length} courses offered in ${sched.termName}, refreshed ${sched.refreshed || "unknown"}`,
      `${catalog.meta.source} (${catalog.meta.url}) — ${catalog.meta.courses} courses, ${catalog.meta.withPrereq} with prerequisites`,
      extras && "RateMyProfessors scores via data.json",
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

  // The source lists some instructors twice — once under the schedule's short
  // spelling with no grade history, once under the full name that carries it.
  // Fold the empty one into the real record so a search for "Politz" returns one
  // person, not two. Only records with no grade history are folded, so two
  // genuinely different people who share a surname and initial stay separate.
  for (const rec of [...profMap.values()]) {
    if (rec.terms > 0) continue;
    const matches = [...profMap.values()].filter(
      (o) => o !== rec && o.terms > 0 && sameInstructor(o.n, rec.n),
    );
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

  const sizeIndex = write("index.json", { meta, subjects, courses: index });
  const sizeGe = write("ge.json", { meta: ge.meta, areas: geAreas, lists: geLists });
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
  console.log(`  professors.json ${professors.length} instructors ${mb(sizeProfs)}`);
  console.log(`  subject/*.json  ${bySubject.size} subjects   ${mb(sizeSubjects)}`);
  console.log(`  ${meta.offered} offered in ${meta.termName} · ${meta.gradeRecords} grade records\n`);
}

console.log("Building UCSDPlans dataset\n");
await download();
build();
console.log("Done.");

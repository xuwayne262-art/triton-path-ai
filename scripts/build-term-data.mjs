#!/usr/bin/env node
/**
 * Builds one term's schedule for the site from a verified public capture.
 *
 *   node scripts/build-term-data.mjs WI27 --raw data/sources/classplanner/WI27/<snapshot>/raw
 *
 * Writes public/data/plat/terms/<TERM>/
 *   index.json          one row per course offered this term: seats, first
 *                       meeting, instructors — what lists and search need
 *   subject/<SUB>.json  every listing of every course, exactly as UCSD
 *                       published it (less the term and subject, said once
 *                       per file), plus department guidance where there is some
 * and records the term in public/data/plat/terms.json.
 *
 * Only what varies by term is here. Grade history, the catalog, GE lists and
 * ratings stay in the shared files (index.json, subject/*.json), which still
 * carry Fall 2026's sections for anything that reads them the old way.
 *
 * The new files are written to a staging directory, checked, and then swapped
 * in, so a failed build leaves the published term as it was.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readListings, verifyCapture, zeroedImport } from "./lib/public-term.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLAT = path.join(ROOT, "public", "data", "plat");
export const MANIFEST = path.join(PLAT, "terms.json");

// ── vocabulary ───────────────────────────────────────────────────────────────

/** "004" -> "4", "001A" -> "1A", "110B" -> "110B": the number the site writes. */
export const courseNumber = (raw) => String(raw ?? "").replace(/^0+(?=\d)/, "");
export const courseCode = (listing) => `${listing.subject_code} ${courseNumber(listing.course_code)}`;

/** "4 units" -> "4", "2.5 units" -> "2.5", "0 units" -> "0". Anything else as printed. */
export const unitsNumber = (display) => {
  const m = /^\s*(\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?)\s*units?\s*$/i.exec(String(display ?? ""));
  return m ? m[1].replace(/\s+/g, "") : String(display ?? "");
};

const TYPE = {
  lecture: "LE", discussion: "DI", lab: "LA", se: "SE", st: "ST", pr: "PR",
  in: "IN", cl: "CL", tu: "TU", fw: "FW", it: "IT", co: "CO", ot: "OT",
};
export const typeCode = (name) => TYPE[name] || String(name || "").slice(0, 2).toUpperCase() || "OT";

const DAY = { M: "M", T: "Tu", W: "W", R: "Th", F: "F", S: "Sa", U: "Su" };
const DAY_ORDER = ["M", "T", "W", "R", "F", "S", "U"];
const clock = (s) => String(s || "").replace(/([ap])m$/i, "$1");

/** A meeting with no real time: TBA, or UCSD's 12:00am-to-12:00am placeholder. */
export const untimed = (m) => m.start_minutes == null || m.end_minutes == null || m.start_minutes === m.end_minutes;
/** Only an undated class meeting repeats weekly. */
export const weekly = (m) => m.meeting_kind === "class" && !m.specific_date;

const isCancelled = (status) => /cancel/i.test(String(status || ""));

/**
 * The first weekly meeting a list row shows: the first lecture's (any
 * section's when there is no lecture) earliest timed weekly pattern, its days
 * folded ("TuTh"). Null when nothing is timed.
 */
export function primaryMeeting(sections) {
  const live = sections.filter((s) => !isCancelled(s.status));
  const order = [...live.filter((s) => s.instruction_type_name === "lecture"), ...live.filter((s) => s.instruction_type_name !== "lecture")];
  for (const s of order) {
    const timed = (s.meetings || []).filter((m) => weekly(m) && !untimed(m));
    if (!timed.length) continue;
    const first = timed[0];
    const same = timed.filter((m) => m.start_minutes === first.start_minutes && m.end_minutes === first.end_minutes);
    const days = [...new Set(same.map((m) => m.day_code).filter(Boolean))]
      .sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
    return { section: s, days: days.map((d) => DAY[d] || d).join(""), start: clock(first.start_time_display), end: clock(first.end_time_display) };
  }
  return null;
}

/**
 * Seats a list row can claim, from the sections themselves: lectures when a
 * course has them, every section otherwise, each once. UCSD counts a
 * lecture's students again on each discussion, so summing everything would
 * count them twice; and its course-level open_seat_count is not used, since it
 * disagrees with its own sections on about a thousand Winter listings (AAPI
 * 198: 0 at the course level, 20 on its one section).
 *
 * `waitlistOnly` is true when every counted section takes a waitlist only.
 */
export function seatTotals(sections) {
  const live = sections.filter((s) => !isCancelled(s.status) && s.capacity != null);
  const pool = live.some((s) => s.instruction_type_name === "lecture") ? live.filter((s) => s.instruction_type_name === "lecture") : live;
  if (!pool.length) return { avail: null, limit: null, waitlistOnly: false };
  const seen = new Set();
  let avail = 0;
  let limit = 0;
  let known = false;
  for (const s of pool) {
    if (seen.has(s.section_id)) continue;
    seen.add(s.section_id);
    if (s.seats_available != null) { avail += Math.max(0, s.seats_available); known = true; }
    limit += s.capacity;
  }
  return { avail: known ? avail : null, limit, waitlistOnly: pool.every((s) => s.status === "waitlist_only") };
}

/** Surname plus first initial, the most two spellings of one person reliably share. */
function sameInstructor(a, b) {
  if (!a || !b) return false;
  const parts = (s) => s.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);
  const pa = parts(a);
  const pb = parts(b);
  if (!pa.length || !pb.length || pa[pa.length - 1] !== pb[pb.length - 1]) return false;
  return pa[0][0] === pb[0][0];
}

const uniq = (xs) => [...new Set(xs.filter((x) => x != null && x !== ""))];

// ── department guidance ──────────────────────────────────────────────────────

/** "PH 102R" or "CSE 209B *" -> "PH 102R" / "CSE 209B". */
const guidanceCode = (s) => String(s || "").replace(/\*/g, "").trim().replace(/\s+/g, " ");

/**
 * A department's own Winter notes, by course: its table row (its estimate of
 * class size, which is not UCSD's section capacity) and the bullet points
 * under a "WI27 <code> Enrollment:" heading. Links on the page that point at
 * someone's local disk (file:///...) are dropped.
 */
export function departmentGuidance(file, name) {
  const out = new Map();
  const table = (file.tables || [])[0] || [];
  const [head, ...rows] = table;
  if (head) {
    for (const row of rows) {
      const code = guidanceCode(row[0]);
      if (!/^[A-Z]{2,5} \d/.test(code)) continue;
      const fields = Object.fromEntries(head.map((h, i) => [h, String(row[i] ?? "").trim()]).filter(([, v]) => v));
      const g = out.get(code) || { notes: [], rows: [] };
      g.rows.push(fields);
      out.set(code, g);
    }
  }
  const notes = file.notes || [];
  for (let i = 0; i < notes.length; i++) {
    const m = /^WI27\s+([A-Z]{2,5}\s*\d+[A-Z]*)\s+Enrollment:?$/i.exec(String(notes[i].text || "").trim());
    if (!m) continue;
    const code = guidanceCode(m[1].replace(/([A-Z])(\d)/, "$1 $2"));
    const g = out.get(code) || { notes: [], rows: [] };
    for (let j = i + 1; j < notes.length && notes[j].type === "li"; j++) g.notes.push(String(notes[j].text).trim());
    out.set(code, g);
  }
  return new Map([...out].map(([code, g]) => [code, {
    name,
    url: file.source_url,
    authority: file.authority,
    ...(g.rows.length ? { rows: g.rows } : {}),
    ...(g.notes.length ? { notes: g.notes } : {}),
  }]));
}

// ── the build ────────────────────────────────────────────────────────────────

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

/** The shared dataset: catalog titles, grade records and ratings, by course. */
function readShared() {
  const index = readJson(path.join(PLAT, "index.json"));
  const rows = new Map(index.courses.map((r) => [r.k, r]));
  const names = new Map(index.subjects.map((s) => [s.code, s.name]));
  const profsOf = (code) => {
    const sub = code.slice(0, code.lastIndexOf(" "));
    const file = path.join(PLAT, "subject", `${sub}.json`);
    if (!fs.existsSync(file)) return [];
    if (!profsOf.cache.has(sub)) profsOf.cache.set(sub, readJson(file).courses);
    return profsOf.cache.get(sub)[code]?.profs || [];
  };
  profsOf.cache = new Map();
  return { meta: index.meta, rows, names, profsOf };
}

/** A listing as published: everything UCSD sent, less what the file says once. */
function publishedListing(l) {
  const out = { ...l };
  delete out.term_code;
  delete out.subject_code;
  delete out.subject_name;
  return out;
}

/**
 * Everything one term publishes, in memory: { index, subjects, counts }.
 * Pure apart from reading the shared dataset, so the tests can run it on the
 * committed capture.
 */
export function buildTerm(term, rawDir, { shared = readShared(), guidance = new Map(), catalog = new Map(), termName } = {}) {
  const coverage = verifyCapture(rawDir, term);
  const listings = readListings(rawDir);
  const filters = readJson(path.join(rawDir, "filters.json"));
  const subjectNames = new Map(filters.subjects.map((s) => [s.value, s.label]));

  const byCode = new Map();
  for (const l of listings) {
    const code = courseCode(l);
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(l);
  }

  const index = [];
  const subjects = new Map();
  let newCourses = 0;
  for (const [code, entries] of byCode) {
    const first = entries[0];
    const sub = first.subject_code;
    const sections = entries.flatMap((l) => l.sections);
    const base = shared.rows.get(code);
    const names = uniq(entries.map((l) => l.module_name));
    const title = base?.t || (names.length === 1 ? names[0] : first.course_title || names[0] || code);
    const meeting = primaryMeeting(sections);
    const seats = seatTotals(sections);
    const instructors = uniq(entries.flatMap((l) => [...l.instructors, ...l.sections.flatMap((s) => s.instructors)]));
    const scheduled = meeting?.section.instructors?.[0] || entries.flatMap((l) => l.instructors)[0] || null;
    const record = scheduled ? shared.profsOf(code).find((p) => sameInstructor(p.i, scheduled)) : null;
    const units = uniq(entries.map((l) => l.units_display));
    const hasTime = sections.some((s) => (s.meetings || []).some((m) => weekly(m) && !untimed(m)));
    if (!base) newCourses++;

    index.push({
      k: code,
      s: sub,
      c: courseNumber(first.course_code),
      t: title,
      u: units.length === 1 ? unitsNumber(units[0]) : units.map(unitsNumber).join(", "),
      sa: seats.avail,
      sl: seats.limit,
      ...(seats.waitlistOnly ? { wo: 1 } : {}),
      d: meeting ? meeting.days || null : null,
      st: meeting ? meeting.start : null,
      en: meeting ? meeting.end : null,
      p: scheduled,
      ...(instructors.length ? { in: instructors } : {}),
      pq: record ? record.rq ?? null : null,
      pn: record ? record.rn ?? null : null,
      pa: record ? record.A || null : null,
      pd: record ? record.rd ?? null : null,
      pg: record && record.g > 0 ? record.g : null,
      lvl: first.academic_level || null,
      ...(entries.some((l) => l.prerequisites.length) ? { tp: 1 } : {}),
      ...(hasTime ? {} : { tba: 1 }),
      // New to the shared dataset; and not in UCSD's catalog either, when no entry matched it.
      ...(base ? {} : { nb: 1, ...(catalog.has(code) ? {} : { ct: 0 }) }),
    });

    if (!subjects.has(sub)) subjects.set(sub, {});
    const dept = guidance.get(code);
    const cat = catalog.get(code);
    subjects.get(sub)[code] = {
      t: title,
      ...(names.length > 1 ? { topics: names } : {}),
      u: units.length === 1 ? unitsNumber(units[0]) : units.map(unitsNumber).join(", "),
      lvl: first.academic_level || null,
      fa: instructors,
      res: uniq(entries.flatMap((l) => l.restrictions)).join("; ") || null,
      tpre: uniq(entries.flatMap((l) => l.prerequisites)).join("; ") || null,
      listings: entries.map(publishedListing),
      ...(dept ? { dept } : {}),
      ...(cat ? { cat } : {}),
    };
  }

  const subjectList = [...subjectNames].map(([code, label]) => ({
    code,
    name: shared.names.get(code) || label || code,
    offered: Object.keys(subjects.get(code) || {}).length,
  })).sort((a, b) => a.code.localeCompare(b.code));

  const header = coverage.term_summary;
  const name = termName || `${{ FA: "Fall", WI: "Winter", SP: "Spring" }[term.slice(0, 2)] || term} 20${term.slice(2)}`;
  const version = `${term}@${String(header.last_full_refresh_at || "").replace(" ", "T").replace(/\+00$/, "Z")}`;
  return {
    coverage,
    newCourses,
    version,
    index: {
      meta: {
        term,
        termName: name,
        v: version,
        source: "UC San Diego Class Planner, public schedule (classplanner.apps.ucsd.edu)",
        refreshed: header.last_full_refresh_at || null,
        counts: {
          listings: coverage.public_search_listings,
          courses: coverage.observed.course_count,
          sections: coverage.observed.section_count,
          meetings: coverage.observed.meeting_count,
          subjects: coverage.subject_count,
          pages: coverage.pages,
        },
        summary: {
          courses: header.course_count ?? null,
          sections: header.section_count ?? null,
          meetings: header.meeting_count ?? null,
        },
        features: { rooms: false, seatTimes: false, booking: false },
        subjects: subjectList,
      },
      courses: index.sort((a, b) => a.k.localeCompare(b.k, "en", { numeric: true })),
    },
    subjects: new Map([...subjects].map(([sub, courses]) => [sub, {
      code: sub,
      name: shared.names.get(sub) || subjectNames.get(sub) || sub,
      term,
      termName: name,
      v: version,
      courses,
    }])),
  };
}

/**
 * What changed since the published version: courses and sections added and
 * withdrawn, and sections whose status, seats, instructors or meetings moved.
 */
export function changesSince(previousDir, built) {
  if (!fs.existsSync(path.join(previousDir, "index.json"))) return null;
  const sectionsIn = (subjectsByName) => {
    const out = new Map();
    for (const file of subjectsByName) {
      for (const [code, c] of Object.entries(file.courses)) {
        for (const l of c.listings) for (const s of l.sections) out.set(s.section_ref, { code, s });
      }
    }
    return out;
  };
  const prevFiles = fs.readdirSync(path.join(previousDir, "subject")).map((f) => readJson(path.join(previousDir, "subject", f)));
  const before = sectionsIn(prevFiles);
  const after = sectionsIn([...built.subjects.values()]);
  const prevCourses = new Set(readJson(path.join(previousDir, "index.json")).courses.map((r) => r.k));
  const nowCourses = new Set(built.index.courses.map((r) => r.k));
  const changed = [];
  for (const [ref, { code, s }] of after) {
    const was = before.get(ref)?.s;
    if (!was) continue;
    const moved = ["status", "capacity", "seats_available", "enrolled", "instructors", "meetings"].filter((k) => JSON.stringify(was[k]) !== JSON.stringify(s[k]));
    if (moved.length) changed.push({ ref, code, fields: moved });
  }
  return {
    previous: readJson(path.join(previousDir, "index.json")).meta.v,
    coursesAdded: [...nowCourses].filter((k) => !prevCourses.has(k)).sort(),
    coursesWithdrawn: [...prevCourses].filter((k) => !nowCourses.has(k)).sort(),
    sectionsAdded: [...after.keys()].filter((r) => !before.has(r)).length,
    sectionsWithdrawn: [...before.keys()].filter((r) => !after.has(r)).length,
    sectionsChanged: changed.length,
    changedSample: changed.slice(0, 20),
  };
}

/**
 * Whether the built term says nothing the published one does not. UCSD's
 * refresh time and the version stamp that carries it are set aside: a refresh
 * that changed nothing is not news, and publishing it would be a commit and a
 * deploy for nothing.
 */
export function sameAsPublished(built, outDir) {
  if (!fs.existsSync(path.join(outDir, "index.json"))) return false;
  const plain = (file) => JSON.stringify({ ...file, v: undefined, meta: file.meta ? { ...file.meta, v: undefined, refreshed: undefined } : undefined });
  if (plain(readJson(path.join(outDir, "index.json"))) !== plain(built.index)) return false;
  const dir = path.join(outDir, "subject");
  const published = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
  if (published.length !== built.subjects.size) return false;
  for (const [sub, file] of built.subjects) {
    const p = path.join(dir, `${sub}.json`);
    if (!fs.existsSync(p) || plain(readJson(p)) !== plain(file)) return false;
  }
  return true;
}

/** Writes the built term next to the published one, then swaps it in. */
export function publishTerm(built, outDir) {
  const parent = path.dirname(outDir);
  fs.mkdirSync(parent, { recursive: true });
  const staged = fs.mkdtempSync(path.join(parent, `.staging-${built.index.meta.term}-`));
  try {
    fs.mkdirSync(path.join(staged, "subject"), { recursive: true });
    fs.writeFileSync(path.join(staged, "index.json"), JSON.stringify(built.index));
    for (const [sub, file] of built.subjects) {
      fs.writeFileSync(path.join(staged, "subject", `${sub}.json`), JSON.stringify(file));
    }
    // Read back before swapping: a file that does not parse is never published.
    const back = readJson(path.join(staged, "index.json"));
    if (back.courses.length !== built.index.courses.length) throw new Error("index did not read back");
    for (const sub of built.subjects.keys()) readJson(path.join(staged, "subject", `${sub}.json`));
    const old = `${outDir}.previous`;
    fs.rmSync(old, { recursive: true, force: true });
    if (fs.existsSync(outDir)) fs.renameSync(outDir, old);
    fs.renameSync(staged, outDir);
    fs.rmSync(old, { recursive: true, force: true });
  } catch (err) {
    fs.rmSync(staged, { recursive: true, force: true });
    throw err;
  }
}

/**
 * The term list the site reads first. Fall 2026 is the shared dataset itself
 * (its rooms and booking links came from Class Planner routes that now need a
 * sign-in, so it is kept as it was last built); later terms are the files this
 * script writes.
 */
export function writeManifest(entry) {
  const shared = readShared().meta;
  const current = fs.existsSync(MANIFEST) ? readJson(MANIFEST) : { terms: [] };
  const fall = {
    code: shared.term,
    name: shared.termName,
    path: null,
    v: shared.retrieved || shared.generated,
    refreshed: shared.refreshed || null,
    retrieved: shared.retrieved || null,
    counts: { courses: shared.offered },
    summary: shared.counts || null,
    features: { rooms: true, seatTimes: true, booking: true },
    frozen: true,
  };
  const others = current.terms.filter((t) => t.code !== entry.code && t.code !== fall.code);
  const terms = [fall, ...others, entry].sort((a, b) => termRank(a.code) - termRank(b.code));
  fs.writeFileSync(MANIFEST, `${JSON.stringify({ terms }, null, 2)}\n`);
  return terms;
}

/** Calendar order: "FA26" < "WI27" < "SP27". */
export function termRank(code) {
  const seasons = ["WI", "SP", "S1", "S2", "S3", "SA", "SU", "FA"];
  const m = /^([A-Z][A-Z0-9])(\d{2})$/.exec(String(code || ""));
  return m ? Number(m[2]) * 10 + Math.max(0, seasons.indexOf(m[1])) : -1;
}

function main() {
  const argv = process.argv.slice(2);
  const term = argv[0];
  const flag = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : null;
  };
  const raw = flag("raw");
  if (!term || !raw) throw new Error("usage: node scripts/build-term-data.mjs WI27 --raw <capture>/raw [--out dir]");
  const outDir = path.resolve(flag("out") || path.join(PLAT, "terms", term));

  const guidance = new Map();
  const deptDir = path.join(ROOT, "data", "sources", "departments", term);
  const DEPARTMENTS = { "public-health.json": "Public Health", "cse-graduate.json": "Computer Science and Engineering (graduate)" };
  if (fs.existsSync(deptDir)) {
    for (const f of fs.readdirSync(deptDir).filter((x) => x.endsWith(".json"))) {
      for (const [code, g] of departmentGuidance(readJson(path.join(deptDir, f)), DEPARTMENTS[f] || f.replace(/\.json$/, ""))) guidance.set(code, g);
    }
  }
  const catalogFile = path.join(ROOT, "data", "sources", "catalog", `${term}-reference.json`);
  const catalog = fs.existsSync(catalogFile) ? new Map(Object.entries(readJson(catalogFile).courses)) : new Map();

  const built = buildTerm(term, path.resolve(raw), { guidance, catalog });
  const prevCoverage = fs.existsSync(path.join(outDir, "index.json"))
    ? { observed: Object.fromEntries(Object.entries(readJson(path.join(outDir, "index.json")).meta.counts).map(([k, v]) => [`${k.replace(/s$/, "")}_count`, v])) }
    : null;
  const zeroed = zeroedImport(built.coverage, prevCoverage);
  if (zeroed) throw new Error(`refusing to publish ${term}: ${zeroed}`);
  const changes = changesSince(outDir, built);
  const report = flag("report");
  if (sameAsPublished(built, outDir)) {
    console.log(`  ${term}: nothing changed but UCSD's refresh time (${built.index.meta.refreshed}); the published files are kept`);
    if (report) fs.writeFileSync(report, `${JSON.stringify({ coverage: built.coverage, changes, unchanged: true }, null, 2)}\n`);
    return;
  }
  publishTerm(built, outDir);
  const meta = built.index.meta;
  writeManifest({
    code: term,
    name: meta.termName,
    path: path.relative(PLAT, outDir).split(path.sep).join("/"),
    v: built.version,
    refreshed: meta.refreshed,
    counts: meta.counts,
    summary: meta.summary,
    features: meta.features,
  });

  const c = built.coverage;
  console.log(`  ${term}  ${c.public_search_listings} listings over ${c.pages} pages, ${c.observed.course_count} courses, ${c.observed.section_count} sections, ${c.observed.meeting_count} meetings, ${c.subject_count} subjects`);
  console.log(`  UCSD's summary: ${c.term_summary.course_count}/${c.term_summary.section_count}/${c.term_summary.meeting_count} (summary minus search: ${Object.values(c.summary_minus_observed).join("/")})`);
  console.log(`  ${built.newCourses} courses the shared dataset has never seen; ${guidance.size} with department guidance; ${catalog.size} catalog references`);
  if (changes) console.log(`  since ${changes.previous}: +${changes.coursesAdded.length}/-${changes.coursesWithdrawn.length} courses, +${changes.sectionsAdded}/-${changes.sectionsWithdrawn} sections, ${changes.sectionsChanged} sections changed`);
  if (report) fs.writeFileSync(report, `${JSON.stringify({ coverage: c, changes }, null, 2)}\n`);
  console.log(`  wrote ${path.relative(ROOT, outDir)} (${built.subjects.size} subject files) and ${path.relative(ROOT, MANIFEST)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (err) {
    console.error(`build-term-data failed: ${err.message}`);
    process.exit(1);
  }
}

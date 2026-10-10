#!/usr/bin/env node
/**
 * Checks the course dataset in public/data/plat before it is published.
 *
 * Every automatic update runs this after building (see
 * .github/workflows/update-data.yml), and nothing is published unless it
 * passes. It can be run by hand after `npm run build:data` too.
 *
 *   ERRORS stop the update: files that do not parse, sections with impossible
 *   times or seats, courses the index and the subject files disagree about,
 *   GE lists that do not add up — and, compared with the dataset it would
 *   replace, a term that suddenly lost a tenth of its courses, any grade
 *   records, or the professors' ratings. Those are signs of a broken fetch,
 *   not of UCSD changing its schedule.
 *   WARNINGS are printed and published anyway: things worth a look that can
 *   be true of a real schedule (a class at 7 a.m., a building with no pin).
 *
 * Run: node scripts/check-data.mjs [--previous <dir>] [--report <file.md>] [--data <dir>]
 *   --previous  the dataset being replaced, for the comparisons
 *   --report    also write the findings as Markdown (for a GitHub issue)
 *   --data      check another directory than public/data/plat
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};
/** The dataset to check: public/data/plat, or `--data <dir>`. */
const DATA = flag("data") ?? path.join(ROOT, "public", "data", "plat");

const TERM_CODE = /^[A-Z][A-Z0-9]\d{2}$/;
const DAYS = /^(M|Tu|W|Th|F|Sa|Su)+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^(\d{1,2}):(\d{2})([ap])$/;
/** A section tuple's columns, as scripts/fetch-classplanner.mjs writes them. */
const S = {
  code: 0, type: 1, days: 2, start: 3, end: 4, building: 5, room: 6, instructor: 7,
  seats: 8, limit: 9, cancelled: 10, waitlist: 11, enrolled: 12, id: 13,
  startMin: 15, endMin: 16, buildingCode: 17,
};

/** How far a count may fall in one update before it is called a broken fetch. */
export const LIMITS = {
  offered: 0.10,
  sections: 0.15,
  catalog: 0.05,
  rated: 0.10,
  /** A new term must list at least this share of the last one's courses. */
  newTerm: 0.60,
};

const errors = [];
const warnings = [];
const error = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

/** "9:00a" -> 540; null when it is not a time. */
function minutes(t) {
  const m = CLOCK.exec(String(t || ""));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 1 || h > 12 || min > 59) return null;
  return (h % 12) * 60 + min + (m[3] === "p" ? 720 : 0);
}

/** A short list for a message: the first few, and how many more. */
function some(items, n = 6) {
  const list = [...items];
  return list.slice(0, n).join(", ") + (list.length > n ? `, and ${list.length - n} more` : "");
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

/** A dataset directory's files, or null with an error when one will not parse. */
export function loadDataset(dir, label) {
  const out = { subjects: {} };
  for (const name of ["index", "ge", "buildings", "professors"]) {
    const file = path.join(dir, `${name}.json`);
    try {
      out[name] = readJson(file);
    } catch (err) {
      error(`${label}: ${name}.json is missing or does not parse (${err.message})`);
      return null;
    }
  }
  const subjectDir = path.join(dir, "subject");
  for (const f of fs.existsSync(subjectDir) ? fs.readdirSync(subjectDir).filter((x) => x.endsWith(".json")) : []) {
    try {
      out.subjects[f.slice(0, -5)] = readJson(path.join(subjectDir, f));
    } catch (err) {
      error(`${label}: subject/${f} does not parse (${err.message})`);
    }
  }
  return out;
}

/** Totals compared across updates. */
export function totals(ds) {
  let sections = 0;
  for (const file of Object.values(ds.subjects)) {
    for (const c of Object.values(file.courses || {})) sections += (c.sec || []).filter((t) => !DATE.test(t[S.days])).length;
  }
  return {
    term: ds.index.meta?.term,
    offered: ds.index.meta?.offered ?? 0,
    catalog: ds.index.courses?.length ?? 0,
    grades: ds.index.meta?.gradeRecords ?? 0,
    rated: (ds.professors.professors || []).filter((p) => p.q != null).length,
    geAreas: (ds.ge.areas || []).length,
    sections,
  };
}

function checkMeta(ds) {
  const m = ds.index.meta || {};
  if (!TERM_CODE.test(m.term || "")) error(`index.json: the term "${m.term}" is not a term code`);
  if (!m.termName) error("index.json: the term has no name");
  for (const k of ["offered", "catalogCourses", "gradeRecords"]) {
    if (!(m[k] > 0)) error(`index.json: meta.${k} is ${m[k]}`);
  }
  for (const k of ["refreshed", "seatsAsOf"]) {
    if (!m[k]) continue;
    const t = Date.parse(String(m[k]).replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
    if (!Number.isFinite(t)) error(`index.json: meta.${k} "${m[k]}" is not a time`);
    else if (t > Date.now() + 86_400_000) error(`index.json: meta.${k} ${m[k]} is in the future`);
  }
  if (m.seatsAsOf && Date.now() - Date.parse(m.seatsAsOf) > 14 * 86_400_000) {
    const days = Math.floor((Date.now() - Date.parse(m.seatsAsOf)) / 86_400_000);
    warn(`seat counts are ${days} days old (${m.seatsAsOf}): Class Planner has not recounted them in TSS since`);
  }
}

function checkCourses(ds) {
  const term = ds.index.meta?.term;
  const seen = new Set();
  const dupes = new Set();
  const offeredInIndex = new Set();
  for (const r of ds.index.courses || []) {
    if (!r.k || !r.s || !r.c || r.k !== `${r.s} ${r.c}`) {
      error(`index.json: a row has a broken code: ${JSON.stringify({ k: r.k, s: r.s, c: r.c })}`);
      continue;
    }
    if (seen.has(r.k)) dupes.add(r.k);
    seen.add(r.k);
    if (r.o === 1) offeredInIndex.add(r.k);
    if (r.g != null && !(r.g >= 0 && r.g <= 4)) error(`index.json: ${r.k} has a GPA of ${r.g}`);
    if (r.a != null && !(r.a >= 0 && r.a <= 100)) error(`index.json: ${r.k} has an A-rate of ${r.a}%`);
  }
  if (dupes.size) error(`index.json lists courses twice: ${some(dupes)}`);

  const wrongTerm = Object.entries(ds.subjects).filter(([, f]) => f.term !== term).map(([s]) => s);
  if (wrongTerm.length) error(`subject files from another term than ${term}: ${some(wrongTerm)}`);

  const offeredInFiles = new Set();
  const noSections = [];
  const unnamed = [];
  const badTimes = [];
  const badDays = [];
  const badSeats = [];
  const early = new Set();
  const late = new Set();
  const negative = new Set();
  const unpinned = new Set();
  const buildings = ds.buildings.buildings || {};

  for (const file of Object.values(ds.subjects)) {
    for (const [code, c] of Object.entries(file.courses || {})) {
      if (!c.offered) continue;
      offeredInFiles.add(code);
      const sec = c.sec || [];
      if (!sec.length) noSections.push(code);
      const weekly = sec.filter((t) => !DATE.test(t[S.days]));
      if (weekly.length && !weekly.some((t) => t[S.instructor] && !/^(staff|tba)$/i.test(t[S.instructor]))) unnamed.push(code);
      for (const t of sec) {
        if (!Array.isArray(t) || t.length < 11 || !t[S.code] || !/^[A-Z]{2}$/.test(t[S.type] || "")) {
          error(`${code}: a section row is malformed: ${JSON.stringify(t).slice(0, 120)}`);
          continue;
        }
        const label = `${code} ${t[S.code]} ${t[S.type]}`;
        const days = t[S.days];
        if (days && !DATE.test(days) && !DAYS.test(days)) badDays.push(`${label} "${days}"`);
        const start = t[S.start] ? minutes(t[S.start]) : null;
        const end = t[S.end] ? minutes(t[S.end]) : null;
        if ((t[S.start] && start == null) || (t[S.end] && end == null)) badTimes.push(`${label} ${t[S.start]}–${t[S.end]}`);
        else if (start != null && end != null) {
          if (end <= start) badTimes.push(`${label} ${t[S.start]}–${t[S.end]}`);
          if (start < 6 * 60) early.add(label);
          if (end > 23 * 60 + 59) late.add(label);
          if (t[S.startMin] != null && t[S.startMin] !== start) badTimes.push(`${label} starts ${t[S.start]} but says minute ${t[S.startMin]}`);
        }
        const seats = t[S.seats];
        const limit = t[S.limit];
        for (const [what, v] of [["seats", seats], ["capacity", limit], ["enrolled", t[S.enrolled]]]) {
          if (v != null && !(Number.isInteger(v) && v >= -9999 && v <= 100000)) badSeats.push(`${label} ${what} ${JSON.stringify(v)}`);
        }
        if (Number.isInteger(seats) && Number.isInteger(limit) && limit >= 0 && seats > limit) badSeats.push(`${label} ${seats} seats left of ${limit}`);
        if (Number.isInteger(seats) && seats < 0) negative.add(label);
        if (t[S.cancelled] !== 0 && t[S.cancelled] !== 1) badSeats.push(`${label} cancelled=${JSON.stringify(t[S.cancelled])}`);
        if (t[S.buildingCode] && !buildings[t[S.buildingCode]]) unpinned.add(t[S.buildingCode]);
      }
    }
  }

  const onlyIndex = [...offeredInIndex].filter((k) => !offeredInFiles.has(k));
  const onlyFiles = [...offeredInFiles].filter((k) => !offeredInIndex.has(k));
  if (onlyIndex.length) error(`offered in index.json but not in its subject file: ${some(onlyIndex)}`);
  if (onlyFiles.length) error(`offered in a subject file but not in index.json: ${some(onlyFiles)}`);
  if (noSections.length) error(`offered with no sections at all: ${some(noSections)}`);
  if (badTimes.length) error(`impossible meeting times (${badTimes.length}): ${some(badTimes)}`);
  if (badDays.length) error(`unknown meeting days (${badDays.length}): ${some(badDays)}`);
  if (badSeats.length) error(`impossible seat counts (${badSeats.length}): ${some(badSeats)}`);

  if (early.size) warn(`meetings before 6 a.m. (${early.size}): ${some(early)}`);
  if (late.size) warn(`meetings past midnight (${late.size}): ${some(late)}`);
  if (negative.size) warn(`over-enrolled sections, fewer than 0 seats (${negative.size}): ${some(negative)}`);
  if (unpinned.size) warn(`buildings with no map location (${unpinned.size}): ${some(unpinned)}`);
  const offered = offeredInFiles.size || 1;
  if (unnamed.length / offered > 0.3) warn(`${unnamed.length} of ${offered} offered courses name no instructor yet`);
}

function checkGe(ds) {
  const keys = new Set((ds.ge.areas || []).map((a) => a.key));
  for (const a of ds.ge.areas || []) {
    const list = ds.ge.lists?.[a.key];
    if (!Array.isArray(list)) error(`ge.json: the area ${a.key} has no list`);
    else if (a.n !== list.length) error(`ge.json: ${a.key} says ${a.n} courses but lists ${list.length}`);
  }
  const orphans = Object.keys(ds.ge.lists || {}).filter((k) => !keys.has(k));
  if (orphans.length) error(`ge.json: lists with no area: ${some(orphans)}`);
}

/** The comparisons with the dataset being replaced. */
function compare(now, before) {
  if (before.term !== now.term) {
    if (now.offered < before.offered * LIMITS.newTerm) {
      error(`${now.term} lists ${now.offered} courses, under ${Math.round(LIMITS.newTerm * 100)}% of ${before.term}'s ${before.offered}: too few to switch to yet`);
    }
  } else {
    const drop = (k, limit, what) => {
      if (before[k] > 0 && now[k] < before[k] * (1 - limit)) {
        error(`${what} fell from ${before[k]} to ${now[k]} (more than ${Math.round(limit * 100)}%)`);
      }
    };
    drop("offered", LIMITS.offered, "courses offered");
    drop("sections", LIMITS.sections, "section meetings");
  }
  const fell = (k, limit, what) => {
    if (before[k] > 0 && now[k] < before[k] * (1 - limit)) error(`${what} fell from ${before[k]} to ${now[k]}`);
  };
  fell("catalog", LIMITS.catalog, "catalogued courses");
  fell("rated", LIMITS.rated, "professors with a rating");
  if (now.grades < before.grades) error(`grade records fell from ${before.grades} to ${now.grades}`);
  if (now.geAreas < before.geAreas) error(`GE areas fell from ${before.geAreas} to ${now.geAreas}`);
}

function main() {
  const now = loadDataset(DATA, "the new dataset");
  if (now) {
    checkMeta(now);
    checkCourses(now);
    checkGe(now);
  }
  const previousDir = flag("previous");
  let summary = "";
  if (now && previousDir) {
    const before = loadDataset(previousDir, "the dataset being replaced");
    if (before) {
      const a = totals(before);
      const b = totals(now);
      compare(b, a);
      summary = `${a.term} → ${b.term}: ${a.offered} → ${b.offered} courses offered, ${a.sections} → ${b.sections} meetings, `
        + `${a.catalog} → ${b.catalog} catalogued, ${a.rated} → ${b.rated} rated professors`;
    }
  } else if (now) {
    const b = totals(now);
    summary = `${b.term}: ${b.offered} courses offered, ${b.sections} meetings, ${b.catalog} catalogued, ${b.rated} rated professors`;
  }

  if (summary) console.log(`  ${summary}`);
  for (const w of warnings) console.log(`  warning  ${w}`);
  for (const e of errors) console.log(`  ERROR    ${e}`);
  console.log(errors.length ? `\n  ${errors.length} error(s): not fit to publish.` : "\n  No errors.");

  const report = flag("report");
  if (report) {
    const lines = [
      summary && `**${summary}**`,
      errors.length ? "### Errors (the update was not published)" : "",
      ...errors.map((e) => `- ${e}`),
      warnings.length ? "### Warnings" : "",
      ...warnings.map((w) => `- ${w}`),
    ].filter(Boolean);
    fs.writeFileSync(report, lines.join("\n") + "\n");
  }
  process.exit(errors.length ? 1 : 0);
}

// Run as a script; importing it (for LIMITS) runs nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

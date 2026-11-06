/**
 * One term of UCSD's public schedule: captured, verified and read.
 *
 * UCSD's Class Planner answers three public requests without a sign-in:
 *
 *   GET  /api/v1/public/catalog/terms                      every configured term and its counts
 *   GET  /api/v1/public/catalog/filters?term_code=WI27     subjects (with course counts) and facets
 *   POST /api/v1/public/catalog/courses/search             {term_code, offset, limit} -> a page of listings
 *
 * The older /planner/terms, /catalog/courses and /schedules/{ref} routes have
 * answered 401 since late October 2026, which is what silently stopped the
 * automatic update. This module uses only the public three.
 *
 * A capture is staged in a new directory and only renamed into place once it
 * verifies, so an interrupted or inconsistent run never replaces a good one.
 * The raw response bodies are kept unaltered (gzip) because they are the only
 * form in which null, "", 0 and [] all stay distinct.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export const API = "https://classplanner.apps.ucsd.edu/api/v1/public/catalog";
/** The search refuses larger pages. */
export const PAGE = 48;
const RETRIES = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A term code as UCSD writes it: "FA26", "WI27", "S127". */
export const TERM_CODE = /^[A-Z][A-Z0-9]\d{2}$/;

/**
 * One request, retried on network errors and on 429/5xx (honouring
 * Retry-After). Any other status fails at once: a 401 means the route needs a
 * sign-in now, and retrying will not change that.
 */
export async function request(pathname, { body, fetchImpl = fetch, retries = RETRIES } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetchImpl(API + pathname, {
        method: body ? "POST" : "GET",
        headers: {
          accept: "application/json",
          "user-agent": "UCSDPlans public schedule import (student project)",
          ...(body ? { "content-type": "application/json", origin: "https://classplanner.apps.ucsd.edu" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      if (attempt >= retries - 1) throw new Error(`${pathname}: ${err.message}`);
      await sleep(500 * 2 ** attempt);
      continue;
    }
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries - 1) throw new Error(`${pathname}: HTTP ${res.status}`);
    const after = Number(res.headers.get("retry-after"));
    await sleep(Math.max(500 * 2 ** attempt, Number.isFinite(after) ? after * 1000 : 0));
  }
}

/** The term's entry in a /terms response, or null when UCSD does not list it. */
export function termHeader(termsBody, term) {
  const terms = JSON.parse(termsBody).terms;
  if (!Array.isArray(terms)) throw new Error("terms response has no terms list");
  return terms.find((t) => t && t.term_code === term) ?? null;
}

// ── Shape ────────────────────────────────────────────────────────────────────
// What a listing, section and meeting must look like for the build to read it.
// UCSD can add fields; a field changing type or disappearing fails the capture.

const LISTING = {
  term_code: "string", subject_code: "string", course_code: "string", module_code: "string",
  module_name: "string", course_title: "string|null", subject_name: "string", academic_level: "string",
  section_count: "number", matching_section_count: "number", complete_package_count: "number",
  open_package_count: "number", waitlist_package_count: "number", open_section_count: "number",
  open_seat_count: "number", waitlist_available_count: "number", instruction_types: "array",
  instructors: "array", is_topic_course: "boolean", section_family: "string|null",
  units_display: "string", course_fees: "array", prerequisites: "array", restrictions: "array", sections: "array",
};
const SECTION = {
  section_id: "string", section_ref: "string", section_code: "string", instruction_type_name: "string",
  event_package_ids: "array", capacity: "number|null", enrolled: "number|null", seats_available: "number|null",
  waitlist_capacity: "number|null", waitlist_enrolled: "number|null", waitlist_available: "number|null",
  status: "string", instructors: "array", meetings: "array", section_text: "array", course_fees: "array",
};
const MEETING = {
  meeting_kind: "string", day_code: "string|null", day_name: "string|null", specific_date: "string|null",
  start_minutes: "number|null", end_minutes: "number|null", start_time_display: "string|null",
  end_time_display: "string|null", is_remote: "boolean", is_tba: "boolean",
};

const kind = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

/** Problems with one object's fields against a shape, as short phrases. */
function shapeProblems(obj, shape, where) {
  if (kind(obj) !== "object") return [`${where} is not an object`];
  const out = [];
  for (const [key, allowed] of Object.entries(shape)) {
    if (!(key in obj)) out.push(`${where} lacks ${key}`);
    else if (!allowed.split("|").includes(kind(obj[key]))) out.push(`${where}.${key} is ${kind(obj[key])}, expected ${allowed}`);
  }
  return out;
}

// ── Reading a capture ────────────────────────────────────────────────────────

/** The page files in offset order: "00000.json.gz", "00048.json.gz", ... */
export function pageFiles(rawDir) {
  const dir = path.join(rawDir, "pages");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /^\d+\.json\.gz$/.test(f))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
    .map((f) => path.join(dir, f));
}

export const readPage = (file) => JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));

/** Every listing in a capture, in UCSD's order. */
export function readListings(rawDir) {
  return pageFiles(rawDir).flatMap((f) => readPage(f).courses);
}

/**
 * Checks a capture is one complete, consistent copy of the term, and counts it.
 *
 * Throws on: a terms response without the term; filters for another term;
 * pages that skip, repeat or change their total; an empty page; a listing of
 * another term; a listing whose sections do not match its own count; a
 * section id that is blank, repeated or not term-qualified; a field missing
 * or of the wrong type; or distinct course counts that disagree with UCSD's
 * own per-subject counts. UCSD's term summary is reported, not enforced: it
 * has disagreed with the search (2,262 vs 2,260 courses on Nov 6, 2026) for
 * reasons UCSD does not publish.
 */
export function verifyCapture(rawDir, term) {
  const header = termHeader(fs.readFileSync(path.join(rawDir, "terms.json")), term);
  if (!header) throw new Error(`UCSD's terms response does not list ${term}`);
  const filters = JSON.parse(fs.readFileSync(path.join(rawDir, "filters.json"), "utf8"));
  if (filters.term_code !== term) throw new Error(`filters are for ${filters.term_code}, not ${term}`);
  if (!Array.isArray(filters.subjects) || !filters.subjects.length) throw new Error("filters list no subjects");
  const expected = new Map(filters.subjects.map((s) => [s.value, s.count]));

  const files = pageFiles(rawDir);
  if (!files.length) throw new Error("no pages");
  const subjects = new Map();
  const ids = new Set();
  let offset = 0;
  let total = null;
  let meetings = 0;
  const problems = [];
  for (const file of files) {
    const page = readPage(file);
    const name = path.basename(file);
    if (page.term_code !== term) throw new Error(`${name} is for ${page.term_code}, not ${term}`);
    if (total === null) total = page.total;
    if (page.total !== total) throw new Error(`${name}: total changed from ${total} to ${page.total} mid-capture`);
    if (page.offset !== offset) throw new Error(`${name}: offset ${page.offset}, expected ${offset}`);
    if (Number.parseInt(name, 10) !== offset) throw new Error(`${name} is not named for its offset ${offset}`);
    if (!Array.isArray(page.courses) || !page.courses.length) throw new Error(`${name} is empty`);
    for (const c of page.courses) {
      const at = `${c?.subject_code ?? "?"} ${c?.course_code ?? "?"}`;
      problems.push(...shapeProblems(c, LISTING, at));
      if (c.term_code !== term) throw new Error(`${at} is a ${c.term_code} listing`);
      if (!Array.isArray(c.sections) || c.sections.length !== c.section_count) {
        throw new Error(`${at}: ${c.sections?.length ?? 0} sections attached, ${c.section_count} counted`);
      }
      if (!subjects.has(c.subject_code)) subjects.set(c.subject_code, new Set());
      subjects.get(c.subject_code).add(c.course_code);
      for (const s of c.sections) {
        problems.push(...shapeProblems(s, SECTION, `${at} ${s?.section_code ?? "?"}`));
        if (!s.section_id || ids.has(s.section_id)) throw new Error(`${at}: blank or repeated section id "${s.section_id}"`);
        if (s.section_ref !== `${term}:${s.section_id}`) throw new Error(`${at}: section_ref ${s.section_ref} is not ${term}:${s.section_id}`);
        ids.add(s.section_id);
        for (const m of s.meetings || []) problems.push(...shapeProblems(m, MEETING, `${at} ${s.section_code} meeting`));
        meetings += (s.meetings || []).length;
      }
    }
    offset += page.courses.length;
  }
  if (problems.length) throw new Error(`the schedule changed shape: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? ` (+${problems.length - 5} more)` : ""}`);
  if (offset !== total) throw new Error(`incomplete: ${offset} of ${total} listings`);
  const counted = new Map([...subjects].map(([s, codes]) => [s, codes.size]));
  const disagree = [...new Set([...counted.keys(), ...expected.keys()])]
    .filter((s) => (counted.get(s) ?? 0) !== (expected.get(s) ?? 0));
  if (disagree.length) {
    throw new Error(`course counts disagree with UCSD's subject counts for ${disagree.slice(0, 8).map((s) => `${s} (${counted.get(s) ?? 0} vs ${expected.get(s) ?? 0})`).join(", ")}`);
  }
  const observed = { course_count: [...counted.values()].reduce((a, b) => a + b, 0), section_count: ids.size, meeting_count: meetings };
  return {
    term,
    pages: files.length,
    public_search_listings: total,
    subject_count: counted.size,
    observed,
    term_summary: header,
    summary_minus_observed: Object.fromEntries(Object.entries(observed).map(([k, v]) => [k, (header[k] ?? 0) - v])),
  };
}

/**
 * Refuses a capture that has lost most of the term since the last good one,
 * which is how an outage that answers with empty-but-valid pages would look.
 * Growth and modest drops pass: a schedule changes.
 */
export function zeroedImport(coverage, previous, { maxDrop = 0.25 } = {}) {
  if (!coverage.observed.section_count || !coverage.public_search_listings) return "the capture holds no sections";
  if (!previous) return null;
  for (const k of ["course_count", "section_count", "meeting_count"]) {
    const was = previous.observed?.[k];
    const now = coverage.observed[k];
    if (was && now < was * (1 - maxDrop)) return `${k} fell from ${was} to ${now}`;
  }
  return null;
}

// ── Capturing ────────────────────────────────────────────────────────────────

/**
 * Captures `term` into `dest`, which must not exist yet. Pages are requested
 * with an explicit term, offset and limit until the total is reached; the term
 * summary is read before and after, and a change in between (UCSD refreshing
 * mid-capture) fails the run rather than mixing two versions.
 */
export async function captureTerm(term, dest, { fetchImpl = fetch, log = () => {}, pause = 250 } = {}) {
  if (!TERM_CODE.test(term)) throw new Error(`not a term code: ${term}`);
  if (fs.existsSync(dest)) throw new Error(`${dest} exists; captures go to a new directory`);
  const parent = path.dirname(dest);
  fs.mkdirSync(parent, { recursive: true });
  const staged = fs.mkdtempSync(path.join(parent, `.staging-${term}-`));
  try {
    const raw = path.join(staged, "raw");
    fs.mkdirSync(path.join(raw, "pages"), { recursive: true });
    const first = await request("/terms", { fetchImpl });
    const before = termHeader(first, term);
    if (!before) throw new Error(`UCSD does not list ${term}`);
    fs.writeFileSync(path.join(raw, "terms.json"), first);
    fs.writeFileSync(path.join(raw, "filters.json"), await request(`/filters?term_code=${encodeURIComponent(term)}`, { fetchImpl }));
    for (let offset = 0; ;) {
      const body = await request("/courses/search", { fetchImpl, body: { term_code: term, offset, limit: PAGE } });
      const page = JSON.parse(body);
      const n = Array.isArray(page.courses) ? page.courses.length : 0;
      if (!n) throw new Error(`empty page at offset ${offset}`);
      if (page.offset !== offset) throw new Error(`asked for offset ${offset}, got ${page.offset}`);
      fs.writeFileSync(path.join(raw, "pages", `${String(offset).padStart(5, "0")}.json.gz`), zlib.gzipSync(body));
      offset += n;
      log(`\r  ${term} ${offset}/${page.total} listings   `);
      if (offset >= page.total) break;
      if (pause) await sleep(pause);
    }
    log("\n");
    const after = termHeader(await request("/terms", { fetchImpl }), term);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`${term} changed during the capture; try again`);
    const coverage = { ...verifyCapture(raw, term), retrieved_at: new Date().toISOString() };
    fs.writeFileSync(path.join(staged, "coverage.json"), `${JSON.stringify(coverage, null, 2)}\n`);
    fs.renameSync(staged, dest);
    return coverage;
  } catch (err) {
    fs.rmSync(staged, { recursive: true, force: true });
    throw err;
  }
}

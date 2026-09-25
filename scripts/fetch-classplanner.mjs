#!/usr/bin/env node
/**
 * Harvests this term's schedule straight from the system UCSD itself runs:
 *
 *   UC San Diego Class Planner — https://classplanner.apps.ucsd.edu/api/v1
 *
 * WHY THIS FILE EXISTS
 * The Fall 2026 schedule used to arrive as `schedule.json` copied from the
 * ucsd-easy-a-radar repo, which is unlicensed, and before that from the legacy
 * Schedule of Classes at act.ucsd.edu, which no longer has the data at all:
 * UCSD moved enrolment to TSS for FA26, and act.ucsd.edu's term list now stops
 * at SU26. Class Planner is UCSD's own replacement front end, its API needs no
 * authentication, and it is refreshed continuously (`last_full_refresh_at`) —
 * so it is both the first-party source and the freshest one.
 *
 * WHAT IT ADDS OVER THE SNAPSHOT IT REPLACES
 *   - instructors PER SECTION and PER COURSE, not one flat list per term;
 *   - live seat, enrolment and waitlist counts;
 *   - prerequisites and enrolment restrictions as UCSD words them;
 *   - TSS module ids + event package ids, which are what a "book this section"
 *     link needs (see harvestTss below);
 *   - building coordinates for every building actually in use this term.
 *
 * Emits .data-cache/classplanner.json, deliberately shaped as a SUPERSET of the
 * old schedule.json — same `term`/`termName`/`buildings`/`courses[code].sec`
 * tuples in the same order — so build-plat-data.mjs reads it without a rewrite
 * and the new fields are additive.
 *
 * Run: node scripts/fetch-classplanner.mjs [--term FA26] [--concurrency 4] [--no-tss]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".data-cache");
const API = "https://classplanner.apps.ucsd.edu/api/v1";
const OUT = path.join(CACHE, "classplanner.json");

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const CONCURRENCY = Math.max(1, Math.min(6, Number(flag("concurrency", 4))));
/** Courtesy gap between requests on a single worker, ms. */
const THROTTLE = 150;
const RETRIES = 3;
/** The API rejects anything larger; it is not a suggestion. */
const PAGE = 48;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = RETRIES) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "UCSDPlans data build (student project)" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= tries) throw new Error(`${url}: ${err.message}`);
      await sleep(400 * attempt);
    }
  }
}

/** Runs `worker` over `items` with a fixed pool, preserving input order. */
async function pool(items, worker, onProgress) {
  const out = new Array(items.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await worker(items[i], i);
        if (onProgress) onProgress(++done, items.length);
        await sleep(THROTTLE);
      }
    }),
  );
  return out;
}

// ── vocabulary translation ───────────────────────────────────────────────────
// Class Planner spells things its own way. The app, its stored shortlists and
// every screenshot of it speak the WebReg dialect the campus already reads
// ("A00", "LE", "TuTh", "3:00p"), so translate once here rather than teaching
// six components two vocabularies.

/** instruction_type_name -> the two-letter code WebReg printed. */
const TYPE = {
  lecture: "LE", discussion: "DI", lab: "LA", se: "SE", st: "ST", pr: "PR",
  in: "IN", cl: "CL", tu: "TU", fw: "FW", it: "IT", co: "CO", ot: "OT",
};
const typeCode = (name) => TYPE[name] || String(name || "").slice(0, 2).toUpperCase() || "OT";

/** day_code -> the day token WebReg concatenated into "TuTh". */
const DAY = { M: "M", T: "Tu", W: "W", R: "Th", F: "F", S: "Sa", U: "Su" };
const DAY_ORDER = ["M", "T", "W", "R", "F", "S", "U"];

/** "5:00pm" -> "5:00p". Same instant, the spelling the rest of the app parses. */
const clock = (s) => String(s || "").replace(/([ap])m$/i, "$1");

/**
 * "001-000-LE" -> "A00", "002-003-DI" -> "B03".
 *
 * TSS numbers section families 001, 002, ... where WebReg lettered them A, B,
 * ...; the middle number is the sequence within the family and 000 is the
 * parent lecture. Past Z the letter would wrap, so families beyond the 26th
 * keep their raw number rather than silently colliding with family 1.
 */
function displayCode(sectionCode) {
  const m = /^(\d+)-(\d+)-/.exec(String(sectionCode || ""));
  if (!m) return String(sectionCode || "");
  const family = Number(m[1]);
  const seq = String(Number(m[2])).padStart(2, "0");
  if (!family || family > 26) return String(sectionCode);
  return String.fromCharCode(64 + family) + seq;
}

/**
 * Class Planner emits ONE meeting per day, so a MWF lecture arrives as three
 * identical rows. Fold rows that share a time and room back into one meeting
 * with a "MWF" day string — otherwise every lecture triples on the calendar.
 */
function foldMeetings(meetings) {
  const byKey = new Map();
  for (const m of meetings || []) {
    const key = [m.meeting_kind, m.start_time_display, m.end_time_display, m.building_code, m.room_code, m.specific_date].join("|");
    let g = byKey.get(key);
    if (!g) {
      g = {
        kind: m.meeting_kind,
        days: [],
        start: clock(m.start_time_display),
        end: clock(m.end_time_display),
        startMin: m.start_minutes ?? null,
        endMin: m.end_minutes ?? null,
        building: m.building_name || m.building_code || "",
        buildingCode: m.building_code || "",
        room: m.room_code || "",
        date: m.specific_date || null,
        tba: !!m.is_tba,
        remote: !!m.is_remote,
      };
      byKey.set(key, g);
    }
    if (m.day_code) g.days.push(m.day_code);
  }
  for (const g of byKey.values()) {
    g.days.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
    g.dayText = g.days.map((d) => DAY[d] || d).join("");
  }
  return [...byKey.values()];
}

// ── harvest ──────────────────────────────────────────────────────────────────

async function pickTerm() {
  const wanted = flag("term", null);
  const { terms } = await getJson(`${API}/planner/terms`);
  const configured = (terms || []).filter((t) => t.configured !== false);
  if (!configured.length) throw new Error("Class Planner lists no configured term");
  const term = wanted ? configured.find((t) => t.term_code === wanted) : configured[0];
  if (!term) throw new Error(`term ${wanted} is not offered; have: ${configured.map((t) => t.term_code).join(", ")}`);
  return term;
}

/** Every course in one subject, following `offset` until the server stops. */
async function fetchSubject(term, subject) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await getJson(
      `${API}/catalog/courses?term_code=${encodeURIComponent(term)}&subject_code=${encodeURIComponent(subject)}&limit=${PAGE}&offset=${offset}`,
    );
    const got = page.courses || [];
    rows.push(...got);
    if (got.length < PAGE || rows.length >= (page.total ?? 0)) break;
  }
  return rows;
}

/**
 * The schedule ref Class Planner puts in a share link: "CS2" + base64 of
 * {s: [section ids], t: term}. It is built client-side with no server secret,
 * which is what makes the batching below possible.
 *
 * The server checks the ref is canonical, so the ids arrive here already sorted
 * and de-duplicated; this function does not reorder them.
 */
const scheduleRef = (sectionIds, term) =>
  "CS2" + Buffer.from(JSON.stringify({ s: sectionIds, t: term })).toString("base64").replace(/=+$/, "");

/**
 * TSS module ids, and the building coordinates that ride along with them.
 *
 * A course's TSS booking URL needs a ModuleID that /catalog/courses does not
 * return; only /schedules/{ref} does, under course_details. That would be one
 * request per course, but a ref may carry several sections and the response
 * details every course they belong to — so batching cuts ~2,400 requests to
 * ~160.
 *
 * Two server rules shape the batching, both discovered by being refused:
 *   - a ref must be CANONICAL, which means the section ids sorted ascending
 *     ("Schedule ref is not canonical"); and
 *   - a schedule may span at most 15 distinct courses.
 * Fifteen is therefore the batch size, not a tuning choice.
 *
 * Failure here is not fatal: a course with no module id simply gets no TSS
 * link, which is the honest outcome. A URL built with a guessed id opens a TSS
 * error page, which is worse than no link.
 */
async function harvestTss(term, courses) {
  const BATCH = 15;
  // One representative section per course — the parent lecture where there is
  // one, since that is what the module id hangs off.
  const probes = courses
    .map((c) => {
      const s = c.sections.find((x) => /-000-/.test(x.section_code)) || c.sections[0];
      return s && s.section_id ? { slug: `${c.subject_code}-${c.course_code}`.toLowerCase(), id: s.section_id } : null;
    })
    .filter(Boolean);

  const batches = [];
  for (let i = 0; i < probes.length; i += BATCH) batches.push(probes.slice(i, i + BATCH));

  const modules = new Map();
  const buildings = new Map();
  let year = "";
  let period = "";

  const results = await pool(
    batches,
    async (batch) => {
      const ref = scheduleRef([...new Set(batch.map((p) => p.id))].sort(), term);
      try {
        return await getJson(`${API}/schedules/${ref}?context=planner`);
      } catch {
        return null; // rule above: no id rather than a wrong one
      }
    },
    (done, total) => process.stdout.write(`\r  tss     batch ${done}/${total}   `),
  );
  process.stdout.write("\n");

  for (const res of results) {
    if (!res) continue;
    for (const [slug, d] of Object.entries(res.course_details || {})) {
      if (d && d.module_id) modules.set(slug, String(d.module_id));
      // Every booking URL in one term shares the year/period pair, so read it
      // from a real URL rather than deriving it from the term code.
      if (!year && d && d.tss_booking_url) {
        const m = /\/(\d{4})\/(\d+)\/\?$/.exec(d.tss_booking_url);
        if (m) { year = m[1]; period = m[2]; }
      }
    }
    for (const loc of (res.map_data && res.map_data.locations) || []) {
      if (loc.display_name && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)) {
        buildings.set(loc.display_name, {
          code: loc.building_code || "",
          ll: [+loc.latitude.toFixed(5), +loc.longitude.toFixed(5)],
          address: loc.address || "",
        });
      }
    }
  }
  return { modules, buildings, year, period };
}

// ── build ────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });

  const term = await pickTerm();
  console.log(`  term    ${term.term_code} — ${term.course_count} courses, ${term.section_count} sections`);
  console.log(`  fresh   UCSD last refreshed this term at ${term.last_full_refresh_at}`);

  const filters = await getJson(`${API}/catalog/filters?term_code=${encodeURIComponent(term.term_code)}`);
  const subjects = (filters.subjects || []).map((s) => s.value);
  const subjectNames = Object.fromEntries((filters.subjects || []).map((s) => [s.value, s.label]));
  console.log(`  subj    ${subjects.length} subjects offered`);

  const pages = await pool(
    subjects,
    (s) => fetchSubject(term.term_code, s),
    (done, total) => process.stdout.write(`\r  courses subject ${done}/${total}   `),
  );
  process.stdout.write("\n");
  const raw = pages.flat();
  console.log(`  courses ${raw.length} fetched`);

  const tss = has("no-tss")
    ? { modules: new Map(), buildings: new Map(), year: "", period: "" }
    : await harvestTss(term.term_code, raw);
  if (!has("no-tss")) {
    console.log(`  tss     ${tss.modules.size} module ids, ${tss.buildings.size} buildings, year ${tss.year || "?"} period ${tss.period || "?"}`);
  }

  const courses = {};
  let sectionCount = 0;

  for (const c of raw) {
    const code = `${c.subject_code} ${c.course_code.replace(/^0+(?=\d)/, "")}`;
    const slug = `${c.subject_code}-${c.course_code}`.toLowerCase();

    const sec = [];
    const meta = [];
    for (const s of c.sections || []) {
      const folded = foldMeetings(s.meetings);
      const cls = folded.filter((m) => m.kind !== "final");
      const finals = folded.filter((m) => m.kind === "final");
      const instructor = (s.instructors || []).join(", ");
      const display = displayCode(s.section_code);

      // One tuple per class meeting pattern, then one per final — the same
      // grain, and the same 11 leading fields, the old schedule.json used.
      for (const m of cls.length ? cls : [null]) {
        sec.push([
          display,
          typeCode(s.instruction_type_name),
          m ? m.dayText : "",
          m ? m.start : "",
          m ? m.end : "",
          m ? m.building : "",
          m ? m.room : "",
          instructor,
          s.seats_available ?? null,
          s.capacity ?? null,
          s.status && s.status !== "AC" ? 1 : 0,
          // additive — nothing downstream indexes past 10
          s.waitlist_enrolled ?? 0,
          s.enrolled ?? null,
          s.section_id || "",
          s.event_package_ids || [],
          m ? m.startMin : null,
          m ? m.endMin : null,
        ]);
        sectionCount++;
      }
      for (const m of finals) {
        sec.push([
          m.date || display, "FI", m.date || "", m.start, m.end, m.building, m.room, "",
          null, null, 0, 0, null, s.section_id || "", s.event_package_ids || [], m.startMin, m.endMin,
        ]);
      }

      meta.push({
        code: display,
        raw: s.section_code,
        type: typeCode(s.instruction_type_name),
        id: s.section_id,
        pkg: s.event_package_ids || [],
        inst: s.instructors || [],
        seats: s.seats_available ?? null,
        cap: s.capacity ?? null,
        enrolled: s.enrolled ?? null,
        wl: s.waitlist_enrolled ?? 0,
        wlCap: s.waitlist_capacity ?? null,
        status: s.status || "",
      });
    }

    courses[code] = {
      t: c.module_name || "",
      u: c.units_display ? String(c.units_display).replace(/\s*units?$/i, "") : "",
      sub: c.subject_code,
      num: c.course_code.replace(/^0+(?=\d)/, ""),
      sec,
      // ── the fields the old snapshot could not answer ──
      inst: c.instructors || [],           // THIS course's instructors, this term
      pre: (c.prerequisites || []).join("; ") || null,
      res: (c.restrictions || []).join("; ") || null,
      lvl: c.academic_level || null,
      openSec: c.open_section_count ?? null,
      openSeats: c.open_seat_count ?? null,
      packages: c.complete_package_count ?? null,
      openPackages: c.open_package_count ?? null,
      tssModule: tss.modules.get(slug) || null,
      sections: meta,
    };
  }

  const buildings = {};
  for (const [name, b] of tss.buildings) buildings[name] = b.ll;

  const out = {
    term: term.term_code,
    termName: term.term_name || termLabel(term.term_code),
    generated: new Date().toISOString(),
    refreshed: term.last_full_refresh_at || null,
    source: "UC San Diego Class Planner (classplanner.apps.ucsd.edu)",
    secCols: [
      "code", "type", "days", "start", "end", "building", "room", "instructor",
      "seatsAvail", "seatsLimit", "cancelled",
      "waitlist", "enrolled", "sectionId", "packageIds", "startMin", "endMin",
    ],
    tss: { year: tss.year, period: tss.period },
    subjectNames,
    buildings,
    courses,
  };

  fs.writeFileSync(OUT, JSON.stringify(out));
  const mb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(2);
  console.log(`\n  wrote   .data-cache/classplanner.json — ${Object.keys(courses).length} courses, ${sectionCount} meetings, ${mb} MB`);

  const withInstructor = Object.values(courses).filter((c) => c.inst.length).length;
  const withTss = Object.values(courses).filter((c) => c.tssModule).length;
  const withPre = Object.values(courses).filter((c) => c.pre).length;
  console.log(`          ${withInstructor} with instructors, ${withTss} with TSS module ids, ${withPre} with prerequisites`);
}

/** "FA26" -> "Fall 2026", only as a fallback when the API omits term_name. */
function termLabel(code) {
  const S = { FA: "Fall", WI: "Winter", SP: "Spring", SU: "Summer", SA: "Summer", S1: "Summer I", S2: "Summer II", S3: "Summer III" };
  const m = /^([A-Z][A-Z0-9])(\d{2})$/.exec(String(code || ""));
  return m && S[m[1]] ? `${S[m[1]]} 20${m[2]}` : String(code || "");
}

main().catch((err) => {
  console.error(`\nfetch-classplanner failed: ${err.message}`);
  process.exit(1);
});

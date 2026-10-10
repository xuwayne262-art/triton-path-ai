#!/usr/bin/env node
/**
 * Says whether the course dataset needs updating from UCSD's Class Planner,
 * in two or three small requests, so the automatic update can ask every half
 * hour and only rebuild when there is something to rebuild.
 *
 * It answers yes when:
 *   - a later quarter's listings are out and complete enough to switch to
 *     (at least LIMITS.newTerm of the current term's courses — a quarter is
 *     often published department by department, and a half-listed term would
 *     tell students their courses are not offered);
 *   - Class Planner's count of the term's courses, sections or meetings is not
 *     the one the dataset was built from;
 *   - Class Planner has recounted seats from TSS at least SEAT_HOURS after the
 *     dataset's newest count, judged on the term's busiest courses;
 *   - it is run with --daily and UCSD has refreshed the term since the dataset
 *     was built, which is what catches an instructor or room changing.
 *
 * Prints one line of JSON — {"update": true, "term": "WI27", "reason": "…"} —
 * and, under GitHub Actions, sets the step's `update`, `term` and `reason`
 * outputs. If Class Planner cannot be reached it says no and why: an outage
 * is not a reason to rebuild, and the next run asks again.
 *
 * Run: node scripts/watch-classplanner.mjs [--daily]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LIMITS } from "./check-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "public", "data", "plat");
const API = "https://classplanner.apps.ucsd.edu/api/v1";
const UA = "UCSDPlans data update (student project)";

/** Seat recounts closer together than this are left for the next one. */
const SEAT_HOURS = 3;
/** Courses sampled for seat recounts: one schedule request holds at most 15. */
const SAMPLE = 15;

const SEASONS = ["WI", "SP", "S1", "S2", "S3", "SA", "SU", "FA"];
const termRank = (code) => {
  const m = /^([A-Z][A-Z0-9])(\d{2})$/.exec(String(code || ""));
  return m ? Number(m[2]) * 10 + Math.max(0, SEASONS.indexOf(m[1])) : -1;
};
const isQuarter = (code) => /^(FA|WI|SP)\d{2}$/.test(String(code || ""));

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": UA } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/** Same as scripts/fetch-classplanner.mjs: "9/21/26 8:37 AM PDT" -> ISO, or null. */
function seatTime(label) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4}) (\d{1,2}):(\d{2}) ?([AP]M) (PDT|PST)$/i.exec(String(label || "").trim());
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const hour = (Number(m[4]) % 12) + (/^p/i.test(m[6]) ? 12 : 0);
  const t = Date.UTC(year, Number(m[1]) - 1, Number(m[2]), hour + (/^PST$/i.test(m[7]) ? 8 : 7), Number(m[5]));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Same as fetch-classplanner.mjs: a share link's schedule ref, ids sorted. */
const scheduleRef = (ids, term) =>
  "CS2" + Buffer.from(JSON.stringify({ s: [...new Set(ids)].sort(), t: term })).toString("base64").replace(/=+$/, "");

/**
 * The term's busiest courses — most students enrolled, so the likeliest to be
 * recounted — with a section id to ask about and the dataset's seat time.
 */
function sample(term) {
  const out = [];
  const dir = path.join(DATA, "subject");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const file = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (file.term !== term) continue;
    for (const [code, c] of Object.entries(file.courses || {})) {
      if (!c.offered || !c.sec?.length) continue;
      const enrolled = c.sec.reduce((n, t) => n + (Number.isInteger(t[12]) ? t[12] : 0), 0);
      const id = c.sec.find((t) => t[13])?.[13];
      if (id) out.push({ code, id, enrolled, at: c.seatsAt || null });
    }
  }
  return out.sort((a, b) => b.enrolled - a.enrolled).slice(0, SAMPLE);
}

async function decide({ daily }) {
  const meta = JSON.parse(fs.readFileSync(path.join(DATA, "index.json"), "utf8")).meta || {};
  const current = meta.term;

  const { terms } = await getJson(`${API}/planner/terms`);
  const served = (terms || []).filter((t) => t.configured !== false);
  const quarters = served.filter((t) => isQuarter(t.term_code));
  const latest = [...(quarters.length ? quarters : served)].sort((a, b) => termRank(b.term_code) - termRank(a.term_code))[0];
  if (!latest) return { update: false, term: current, reason: "Class Planner lists no term" };

  // ── A later quarter ────────────────────────────────────────────────────────
  if (termRank(latest.term_code) > termRank(current)) {
    const had = meta.counts?.courses ?? meta.offered ?? 0;
    const needed = Math.ceil(had * LIMITS.newTerm);
    if ((latest.course_count ?? 0) >= needed) {
      return { update: true, term: latest.term_code, reason: `${latest.term_code} is out with ${latest.course_count} courses: switching from ${current}` };
    }
    // Not yet: keep following the current term while the next one fills in.
    const note = `${latest.term_code} is listed with ${latest.course_count} courses; switching once it has ${needed}`;
    const stay = served.find((t) => t.term_code === current);
    if (!stay) return { update: false, term: current, reason: `${note} (Class Planner no longer serves ${current})` };
    return { ...(await sameTerm(stay, meta, daily)), note };
  }

  const stay = served.find((t) => t.term_code === current) || latest;
  return sameTerm(stay, meta, daily);
}

/** The questions for the term the dataset already shows. */
async function sameTerm(term, meta, daily) {
  const code = term.term_code;
  const was = meta.counts || {};
  const now = { courses: term.course_count ?? null, sections: term.section_count ?? null, meetings: term.meeting_count ?? null };
  if (!meta.counts || ["courses", "sections", "meetings"].some((k) => now[k] !== was[k])) {
    return {
      update: true, term: code,
      reason: meta.counts
        ? `${code}'s listings changed: ${was.courses}/${was.sections}/${was.meetings} → ${now.courses}/${now.sections}/${now.meetings} courses/sections/meetings`
        : `the dataset does not yet record Class Planner's counts for ${code}`,
    };
  }

  // Seats recounted since the dataset's newest count, on the busiest courses.
  const picks = sample(code);
  if (picks.length) {
    const res = await getJson(`${API}/schedules/${scheduleRef(picks.map((p) => p.id), code)}?context=planner`);
    const counted = Object.values(res.course_details || {})
      .map((d) => seatTime(d?.seat_freshness?.label)).filter(Boolean).sort();
    const theirs = counted[counted.length - 1];
    const ours = picks.map((p) => p.at).filter(Boolean).sort().pop();
    if (theirs && (!ours || Date.parse(theirs) - Date.parse(ours) >= SEAT_HOURS * 3_600_000)) {
      return { update: true, term: code, reason: `Class Planner recounted seats at ${theirs} (the dataset's are from ${ours || "an unknown time"})` };
    }
  }

  if (daily && term.last_full_refresh_at && term.last_full_refresh_at !== meta.refreshed) {
    return { update: true, term: code, reason: `daily check: UCSD refreshed ${code} at ${term.last_full_refresh_at}` };
  }
  return { update: false, term: code, reason: `${code} unchanged since ${meta.refreshed}` };
}

async function main() {
  let out;
  try {
    out = await decide({ daily: process.argv.includes("--daily") });
  } catch (err) {
    out = { update: false, term: null, reason: `Class Planner could not be checked: ${err.message}` };
  }
  console.log(JSON.stringify(out));
  if (process.env.GITHUB_OUTPUT) {
    const reason = [out.reason, out.note].filter(Boolean).join("; ").replace(/[\r\n]+/g, " ");
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `update=${out.update}\nterm=${out.term ?? ""}\nreason=${reason}\n`);
  }
}

main();

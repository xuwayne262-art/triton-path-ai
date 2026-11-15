#!/usr/bin/env node
/**
 * Says which quarters to rebuild from UCSD's public schedule, in one request,
 * so the automatic update can ask every half hour and only rebuild when there
 * is something to rebuild.
 *
 * A term the site builds from the public schedule is rebuilt when:
 *   - UCSD's count of its courses, sections or meetings is not the one it was
 *     built from (something added or withdrawn); or
 *   - UCSD has refreshed it since the refresh last seen (the state file the
 *     workflow keeps in its cache; the published one otherwise); or
 *   - its seats were last read more than SEATS_MAX_AGE_HOURS ago. UCSD updates
 *     seats in place without moving its refresh time or any count: Winter 2027
 *     enrollment filled CSE 12 to 85 of 395 while the refresh still said Nov 6
 *     and the site still said 0. A re-read that finds nothing new publishes
 *     nothing; the state file remembers it, so it is not repeated every run.
 * A later quarter appearing is added once it lists at least half as many
 * courses as the newest one the site serves: quarters are often published
 * department by department, and a half-listed one would tell students their
 * courses are not offered.
 *
 * Fall 2026 is kept as last built (its rooms and booking links came from
 * routes that now need a sign-in); when UCSD changes it, that is reported, not
 * rebuilt.
 *
 * Prints {"update": true, "terms": ["WI27"], "reason": "..."}; under GitHub
 * Actions also sets the step's outputs. If UCSD cannot be read it fails:
 * an unreadable source is news, not "nothing changed". (The watcher this
 * replaces said "no" on a 401 for two weeks while the site went stale.)
 *
 * Run: node scripts/watch-public-terms.mjs [--state .data-cache/watch-state.json]
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { request } from "./lib/public-term.mjs";
import { MANIFEST, termRank } from "./build-term-data.mjs";

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};
const COUNTS = [["course_count", "courses"], ["section_count", "sections"], ["meeting_count", "meetings"]];
export const SEATS_MAX_AGE_HOURS = 12;

/**
 * The decision, from UCSD's terms, the published manifest, the last-seen
 * refresh per term and `seen.checked` (when each term was last re-read), as of
 * `now`. Pure, for the tests.
 */
export function decide(ucsdTerms, manifest, seen = {}, now = Date.now()) {
  const served = new Map(manifest.terms.map((t) => [t.code, t]));
  const newest = manifest.terms.reduce((best, t) => (termRank(t.code) > termRank(best.code) ? t : best), manifest.terms[0]);
  const newestCourses = newest?.summary?.courses ?? newest?.counts?.courses ?? 0;
  const terms = [];
  const reasons = [];
  for (const t of ucsdTerms) {
    const code = t.term_code;
    if (t.configured === false || !/^(FA|WI|SP)\d{2}$/.test(code)) continue;
    const mine = served.get(code);
    if (!mine) {
      if (termRank(code) <= termRank(newest.code)) continue;
      if ((t.course_count ?? 0) >= newestCourses / 2) {
        terms.push(code);
        reasons.push(`${code} is on UCSD's public schedule with ${t.course_count} courses`);
      } else {
        reasons.push(`${code} lists ${t.course_count ?? 0} courses so far; waiting for at least ${Math.ceil(newestCourses / 2)}`);
      }
      continue;
    }
    const moved = COUNTS.filter(([theirs, ours]) => (t[theirs] ?? null) !== (mine.summary?.[ours] ?? null))
      .map(([theirs, ours]) => `${ours} ${mine.summary?.[ours] ?? "?"} -> ${t[theirs] ?? "?"}`);
    const last = seen[code] ?? mine.refreshed ?? null;
    const refreshed = (t.last_full_refresh_at ?? null) !== last;
    if (mine.path === null) {
      if (moved.length || refreshed) reasons.push(`${code} changed at UCSD (${moved.join(", ") || `refreshed ${t.last_full_refresh_at}`}) but is kept as built ${mine.refreshed}: its rooms came from routes that now need a sign-in`);
      continue;
    }
    const lastRead = Math.max(Date.parse(mine.retrieved ?? "") || 0, Date.parse(seen.checked?.[code] ?? "") || 0);
    const hours = lastRead ? Math.floor((now - lastRead) / 3_600_000) : null;
    const stale = hours === null || hours >= SEATS_MAX_AGE_HOURS;
    if (moved.length || refreshed || stale) {
      terms.push(code);
      reasons.push(`${code}: ${moved.length ? moved.join(", ")
        : refreshed ? `UCSD refreshed it at ${t.last_full_refresh_at}`
        : `seats last read ${hours === null ? "at an unknown time" : `${hours} h ago`}`}`);
    }
  }
  return { update: terms.length > 0, terms, reason: reasons.join("; ") || "no quarter changed" };
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const stateFile = flag("state");
  const seen = stateFile && fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : {};
  const { terms } = JSON.parse(await request("/terms"));
  if (!Array.isArray(terms)) throw new Error("UCSD's terms response has no terms list");
  const result = decide(terms, manifest, seen);
  // What UCSD said this time, and which terms this run re-reads, for the
  // workflow to keep once the rebuild has gone through.
  result.ucsd = Object.fromEntries(terms.map((t) => [t.term_code, t.last_full_refresh_at ?? null]));
  const checkedNow = Object.fromEntries(result.terms.map((code) => [code, new Date().toISOString()]));
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `update=${result.update}\nterms=${result.terms.join(" ")}\nreason=${result.reason.replace(/\n/g, " ")}\n`);
  }
  if (flag("save-seen")) {
    fs.writeFileSync(flag("save-seen"), JSON.stringify({ ...seen, ...result.ucsd, checked: { ...(seen.checked ?? {}), ...checkedNow } }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`UCSD's public schedule could not be checked: ${err.message}`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `update=false\nterms=\nreason=UCSD's public schedule could not be checked: ${err.message}\n`);
    process.exit(1);
  });
}

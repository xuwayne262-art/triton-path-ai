#!/usr/bin/env node
/**
 * Harvests UCSD grade distributions straight from the source that publishes them:
 *
 *   AS Instructor Grade Archive — https://asmain.ucsd.edu/Home/InstructorGradeArchive
 *
 * This is UCSD Associated Students' own publication of registrar grade data, and
 * it is what the third-party aggregators were themselves scraping. Going direct
 * means the numbers are first-party and citable, and nothing in the pipeline
 * depends on someone else's unlicensed redistribution of them.
 *
 * The archive is a POST form (quarter, year, instructor, subject, courseNumber)
 * that renders one HTML table row per course x instructor x quarter. Querying by
 * subject alone returns that subject's entire history in a single request, so a
 * full harvest is ~200 requests rather than one per course.
 *
 * Emits .data-cache/as-grades.json:
 *   rows  [sub, num, yy, qtr, title, instructor, gpa, A,B,C,D,F,W,P,NP]  one per term
 *   meta  { source, retrieved, subjects, rows, years }
 *
 * The per-term grain is deliberately preserved — build-plat-data.mjs aggregates
 * it, but keeping the raw terms allows "is this course getting harder?" later.
 *
 * Run: node scripts/fetch-as-grades.mjs [--subjects CSE,MATH] [--concurrency 3]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".data-cache");
const ENDPOINT = "https://asmain.ucsd.edu/Home/InstructorGradeArchive";
const OUT = path.join(CACHE, "as-grades.json");

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const CONCURRENCY = Math.max(1, Math.min(6, Number(flag("concurrency", 3))));
/** Courtesy gap between requests on a single worker, ms. */
const THROTTLE = 250;
const RETRIES = 3;

/**
 * The archive has no "list all subjects" endpoint, so the subject list is
 * derived once from the catalog + schedule and cached next to this script.
 */
function subjectList() {
  const override = flag("subjects", null);
  if (override) return override.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const cached = path.join(ROOT, "scripts", ".subjects.json");
  if (fs.existsSync(cached)) return JSON.parse(fs.readFileSync(cached, "utf8"));
  throw new Error("no subject list — pass --subjects, or generate scripts/.subjects.json");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Entities are the only markup that survives into the cell text. */
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
const decode = (s) =>
  s.replace(/&(#?\w+);/g, (m, e) => ENTITIES[e] ?? (e[0] === "#" ? String.fromCharCode(+e.slice(1)) : m));

/** "28.6%" -> 28.6, "" -> 0. Percentages, not counts — same units the app expects. */
const pct = (s) => {
  const n = parseFloat(String(s).replace("%", ""));
  return Number.isFinite(n) ? n : 0;
};

/** Pulls the result table out of the rendered page. */
function parseRows(html) {
  const body = (html.split("<tbody>")[1] || "").split("</tbody>")[0] || "";
  const out = [];
  for (const tr of body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
      decode(c[1].replace(/<[^>]*>/g, "").trim()),
    );
    if (cells.length < 15) continue;
    const [sub, num, yy, qtr, title, instructor, gpa, A, B, C, D, F, W, P, NP] = cells;
    out.push([
      sub, num, yy, qtr, title, instructor,
      Number.isFinite(parseFloat(gpa)) ? +parseFloat(gpa).toFixed(3) : null,
      pct(A), pct(B), pct(C), pct(D), pct(F), pct(W), pct(P), pct(NP),
    ]);
  }
  return out;
}

async function fetchSubject(subject) {
  const body = new URLSearchParams({
    quarter: "", year: "", instructor: "", subject, courseNumber: "",
  });

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // The archive is a normal browser form; identify the harvester honestly.
          "User-Agent": "UCSDPlans data build (student course tool; contact via repo)",
          Referer: ENDPOINT,
        },
        body,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseRows(await res.text());
    } catch (err) {
      if (attempt === RETRIES) throw err;
      await sleep(600 * attempt);
    }
  }
  return [];
}

async function main() {
  const subjects = subjectList();
  fs.mkdirSync(CACHE, { recursive: true });
  console.log(`AS Instructor Grade Archive — ${subjects.length} subjects, concurrency ${CONCURRENCY}`);

  const rows = [];
  const failed = [];
  let done = 0;

  const queue = [...subjects];
  const worker = async () => {
    while (queue.length) {
      const sub = queue.shift();
      try {
        const got = await fetchSubject(sub);
        rows.push(...got);
        done++;
        if (got.length) console.log(`  ${String(done).padStart(3)}/${subjects.length}  ${sub.padEnd(6)} ${got.length} rows`);
        else console.log(`  ${String(done).padStart(3)}/${subjects.length}  ${sub.padEnd(6)} —`);
      } catch (err) {
        done++;
        failed.push(sub);
        console.log(`  ${String(done).padStart(3)}/${subjects.length}  ${sub.padEnd(6)} FAILED ${err.message}`);
      }
      await sleep(THROTTLE);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const years = [...new Set(rows.map((r) => r[2]))].sort();
  const payload = {
    meta: {
      source: "UCSD Associated Students Instructor Grade Archive",
      url: ENDPOINT,
      retrieved: new Date().toISOString().slice(0, 10),
      subjects: subjects.length,
      subjectsFailed: failed,
      rows: rows.length,
      years: years.length ? `20${years[0]}-20${years[years.length - 1]}` : null,
      cols: ["s", "c", "y", "q", "t", "i", "g", "gA", "gB", "gC", "gD", "gF", "gW", "gP", "gNP"],
      grain: "one row per course x instructor x quarter; letter columns are percentages",
    },
    rows,
  };

  fs.writeFileSync(OUT, JSON.stringify(payload));
  console.log(`\n${rows.length.toLocaleString()} rows, ${years.length} years -> ${path.relative(ROOT, OUT)}`);
  if (failed.length) console.log(`failed subjects: ${failed.join(", ")}`);
}

await main();

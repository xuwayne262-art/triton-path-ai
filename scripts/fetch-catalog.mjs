#!/usr/bin/env node
/**
 * Harvests the official UCSD course catalog — https://catalog.ucsd.edu
 *
 * The grade archive only knows about courses that have actually been taught and
 * graded, and the WebReg snapshot only knows about this coming term. Neither
 * covers a course like AAS 14 that is a real, current, requirement-satisfying
 * catalog entry which simply is not running this quarter. The catalog is the
 * list of what exists; the other two say how it went and when it next meets.
 *
 * Department pages are named after the department, not the subject code
 * (AASM.html holds the AAS courses), so codes are parsed out of the entry text
 * rather than inferred from the filename.
 *
 * Emits .data-cache/catalog.json:
 *   courses  [code, sub, num, title, units, prereqText]
 *   meta     { source, retrieved, pages, courses }
 *
 * Run: node scripts/fetch-catalog.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".data-cache");
const BASE = "https://catalog.ucsd.edu";
const INDEX = `${BASE}/front/courses.html`;
const OUT = path.join(CACHE, "catalog.json");

const CONCURRENCY = 4;
const THROTTLE = 200;
const RETRIES = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " ", "#160": " " };
const decode = (s) =>
  s.replace(/&(#?\w+);/g, (m, e) => ENTITIES[e] ?? (e[0] === "#" ? String.fromCharCode(+e.slice(1)) : m));

const clean = (html) => decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

async function get(url) {
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "TritonPlat data build (student course tool; contact via repo)" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === RETRIES) throw err;
      await sleep(500 * attempt);
    }
  }
  return "";
}

/**
 * "CSE 106. Discrete and Continuous Optimization (4) Tag: Theory/Abstraction"
 *   -> [{ code: "CSE 106", title: "Discrete and Continuous Optimization", units: "4" }]
 *
 * Cross-listed courses head the entry with every code they answer to —
 * "BENG 202/CSE 282. Bioinformatics II (4)" is one course a student may find
 * under either department, so both codes are emitted against the same entry.
 *
 * The trailing curriculum "Tag:" is editorial decoration, not part of the title.
 */
/** One code token: an optional subject, a number, and optional "-B-C" sequence tail. */
const TOKEN = String.raw`(?:[A-Z]{2,6}\s*)?\d+[A-Z]*(?:-[A-Z]+)*`;

/**
 * "MATH 220A-B-C" is three courses, and in "HIEU 157/157GS" the second code
 * inherits the subject the first one named.
 */
function expandToken(raw, lastSub) {
  const m = /^([A-Z]{2,6})?\s*(\d+)([A-Z]*)((?:-[A-Z]+)*)$/.exec(raw.trim().replace(/\s+/g, " "));
  if (!m) return { sub: lastSub, nums: [] };
  const [, sub, digits, suffix, tail] = m;
  const nums = [`${digits}${suffix}`];
  for (const part of tail.split("-").filter(Boolean)) nums.push(`${digits}${part}`);
  return { sub: sub || lastSub, nums };
}

function parseName(text) {
  const m = new RegExp(String.raw`^((?:${TOKEN})(?:\s*/\s*(?:${TOKEN}))*)\.\s*(.+)$`).exec(
    text.replace(/\s+Tag:.*$/i, "").trim(),
  );
  if (!m) return [];
  const [, codes, rest] = m;
  const u = /\(([\d./–-]+)\)\s*$/.exec(rest);
  const title = (u ? rest.slice(0, u.index) : rest).trim().replace(/[.,]$/, "");
  const units = u ? u[1].replace(/–/g, "-") : "";

  const out = [];
  let lastSub = null;
  for (const raw of codes.split("/")) {
    const { sub, nums } = expandToken(raw, lastSub);
    if (!sub) continue;
    lastSub = sub;
    for (const num of nums) out.push({ code: `${sub} ${num}`, sub, num, title, units });
  }

  // "(4-4-4)" is one figure per course in a sequence; "(2-4)" on a single course
  // is a variable-unit range and must be left intact.
  const parts = units.split("-");
  if (parts.length > 1 && parts.length === out.length) out.forEach((c, i) => { c.units = parts[i]; });

  return out;
}

/** The catalog states prerequisites as a sentence at the end of the description. */
function parsePrereq(desc) {
  const m = /Prerequisites?:\s*([\s\S]+)$/i.exec(desc);
  if (!m) return "";
  return m[1].split(/(?:\s|^)(?:Note|Renumbered|Formerly|May be)\b/)[0].trim();
}

function parsePage(html) {
  const names = [...html.matchAll(/<p class="course-name">([\s\S]*?)<\/p>/g)].map((m) => clean(m[1]));
  const descs = [...html.matchAll(/<p class="course-descriptions">([\s\S]*?)<\/p>/g)].map((m) => clean(m[1]));
  const out = [];
  for (let i = 0; i < names.length; i++) {
    const prereq = parsePrereq(descs[i] || "");
    for (const c of parseName(names[i])) {
      out.push([c.code, c.sub, c.num, c.title, c.units, prereq]);
    }
  }
  return out;
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const index = await get(INDEX);
  const pages = [...new Set([...index.matchAll(/href="[^"]*courses\/([A-Z]+)\.html"/g)].map((m) => m[1]))];
  console.log(`UCSD catalog — ${pages.length} department pages`);

  const byCode = new Map();
  const queue = [...pages];
  let done = 0;

  const worker = async () => {
    while (queue.length) {
      const page = queue.shift();
      try {
        const rows = parsePage(await get(`${BASE}/courses/${page}.html`));
        // A cross-listed course can appear on two department pages; first wins,
        // but a later page with a prerequisite line fills a gap left by the first.
        for (const r of rows) {
          const prev = byCode.get(r[0]);
          if (!prev) byCode.set(r[0], r);
          else if (!prev[5] && r[5]) prev[5] = r[5];
        }
        done++;
        console.log(`  ${String(done).padStart(2)}/${pages.length}  ${page.padEnd(6)} ${rows.length} courses`);
      } catch (err) {
        done++;
        console.log(`  ${String(done).padStart(2)}/${pages.length}  ${page.padEnd(6)} FAILED ${err.message}`);
      }
      await sleep(THROTTLE);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const courses = [...byCode.values()].sort((a, b) => a[0].localeCompare(b[0]));
  const payload = {
    meta: {
      source: "UCSD General Catalog",
      url: `${BASE}/front/courses.html`,
      retrieved: new Date().toISOString().slice(0, 10),
      pages: pages.length,
      courses: courses.length,
      withPrereq: courses.filter((c) => c[5]).length,
      cols: ["code", "sub", "num", "title", "units", "prereq"],
    },
    courses,
  };

  fs.writeFileSync(OUT, JSON.stringify(payload));
  console.log(
    `\n${courses.length.toLocaleString()} courses (${payload.meta.withPrereq.toLocaleString()} with prerequisites) -> ${path.relative(ROOT, OUT)}`,
  );
}

await main();

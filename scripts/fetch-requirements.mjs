#!/usr/bin/env node
/**
 * Harvests the two campus-wide requirements every UCSD undergraduate has on
 * top of their college's GEs, from the offices that set them:
 *
 *   American History & Institutions (AHI)
 *     UCSD General Catalog, Undergraduate Degree Requirements —
 *     https://catalog.ucsd.edu/undergraduate/degree-requirements/index.html
 *     One sentence lists the approved courses, plus "any course listed under
 *     HIUS (other than HIUS colloquia)", which build-plat-data.mjs expands
 *     against the catalog.
 *
 *   Diversity, Equity & Inclusion (DEI)
 *     Academic Senate list of approved courses (a PDF) —
 *     https://senate.ucsd.edu/media/513521/dei-list-of-courses.pdf
 *     plus the Undergraduate Education page's table of this quarter's DEI
 *     courses — https://undergrad.ucsd.edu/academics/dei/index.html — which
 *     carries approvals newer than the PDF.
 *
 * The PDF is read with `pdftotext` (poppler). It ships with Git for Windows;
 * on macOS run `brew install poppler`. Without it the DEI list falls back to
 * the quarter's table alone, and the script says so.
 *
 * Emits .data-cache/requirements.json:
 *   ahi  { codes, anyUnder: ["HIUS"], source, url, retrieved }
 *   dei  { codes, term: { name, asOf, codes }, source, url, retrieved }
 *
 * Run: node scripts/fetch-requirements.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".data-cache");
const OUT = path.join(CACHE, "requirements.json");

const AHI_URL = "https://catalog.ucsd.edu/undergraduate/degree-requirements/index.html";
const DEI_PDF = "https://senate.ucsd.edu/media/513521/dei-list-of-courses.pdf";
const DEI_PAGE = "https://undergrad.ucsd.edu/academics/dei/index.html";
const UA = "UCSDPlans data build (student course tool; contact via repo)";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " ", "#160": " " };
const decode = (s) =>
  s.replace(/&(#?\w+);/g, (m, e) => ENTITIES[e] ?? (e[0] === "#" ? String.fromCharCode(+e.slice(1)) : m));
const text = (html) => decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

async function get(url, as = "text") {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return as === "buffer" ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (err) {
      if (attempt === 3) throw new Error(`${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return "";
}

/**
 * "POLI 10, 10D, 100A-B-C, 110EA-EB" -> POLI 10, POLI 10D, POLI 100A, POLI 100B,
 * POLI 100C, POLI 110EA, POLI 110EB. A number with no subject inherits the one
 * before it, and "-B-C" / "-EB" continue a sequence on the same digits.
 */
export function expandList(list) {
  const out = [];
  let sub = null;
  for (const raw of list.split(",")) {
    const token = raw.replace(/^\s*(?:and|or)\s+/i, "").replace(/[.\s]+$/, "").trim();
    const m = /^(?:([A-Z]{2,5})\s+)?(\d+)([A-Z]*)((?:-[A-Z]+)*)$/.exec(token);
    if (!m) continue;
    const [, s, digits, suffix, tail] = m;
    if (s) sub = s;
    if (!sub) continue;
    out.push(`${sub} ${digits}${suffix}`);
    for (const part of tail.split("-").filter(Boolean)) out.push(`${sub} ${digits}${part}`);
  }
  return out;
}

async function fetchAhi() {
  const page = text(await get(AHI_URL));
  const start = page.indexOf("Any of the following courses are suitable for fulfilling the requirement:");
  if (start < 0) throw new Error("AHI: the catalog no longer has the course sentence this reads");
  const sentence = page.slice(start).split(":").slice(1).join(":").split(/\bBy presenting proof\b/)[0];
  const anyUnder = [...sentence.matchAll(/any course listed under ([A-Z]{2,5})/g)].map((m) => m[1]);
  const codes = sentence
    .split(";")
    .flatMap((group) => expandList(group.replace(/or any course listed under [A-Z]{2,5} \([^)]*\)/g, "")));
  return {
    codes: [...new Set(codes)],
    anyUnder,
    note: "Any course listed under HIUS counts, other than HIUS colloquia.",
    source: "UCSD General Catalog, Undergraduate Degree Requirements",
    url: AHI_URL,
    retrieved: new Date().toISOString().slice(0, 10),
  };
}

/**
 * Course codes from the Senate PDF's "Course" column only.
 *
 * The prerequisite column names courses too ("CSE 12 or ECE 35"), so reading
 * every code on the page would file prerequisites as DEI courses. pdftotext
 * keeps the table's columns at fixed offsets, and each page repeats the
 * header, so the "Course Title" heading marks where the course column ends.
 */
export function deiCodesFromPdfText(pdfText) {
  const codes = new Set();
  const CODE = /\b([A-Z]{2,5})\s*(\d{1,3}[A-Z]{0,3})((?:\s*\/\s*(?:[A-Z]{2,5}\s*)?\d{0,3}[A-Z]{0,3})*)/g;
  for (const page of pdfText.split("\f")) {
    const lines = page.split(/\r?\n/);
    const header = lines.find((l) => /Course Title/.test(l));
    if (!header) continue;
    const titleAt = header.indexOf("Course Title");
    for (const line of lines) {
      for (const m of line.slice(0, titleAt).matchAll(CODE)) {
        const [, sub, num, tail] = m;
        codes.add(`${sub} ${num}`);
        // "AAS 10/R" is AAS 10 and AAS 10R; "CGS 112/ ETHN 127" is a cross-listing.
        let lastSub = sub;
        for (const part of (tail || "").split("/").map((s) => s.trim()).filter(Boolean)) {
          const pm = /^(?:([A-Z]{2,5})\s*)?(\d{0,3}[A-Z]{0,3})$/.exec(part);
          if (!pm || !pm[2]) continue;
          const s2 = pm[1] || lastSub;
          const n2 = /^[A-Z]+$/.test(pm[2]) ? num.replace(/[A-Z]+$/, "") + pm[2] : pm[2];
          codes.add(`${s2} ${n2}`);
          lastSub = s2;
        }
      }
    }
  }
  return [...codes].sort();
}

/** "AAS-010R" -> "AAS 10R", the spelling every other source uses. */
const fromDashed = (code) => code.replace(/^([A-Z]{2,5})-0*(\d+[A-Z]*)$/, "$1 $2");

async function fetchDei() {
  const html = await get(DEI_PAGE);
  const caption = /<caption>([^<]*)<\/caption>/.exec(html);
  const asOf = /courses for the ([A-Za-z]+ \d{4}) Quarter, as of ([\d/]+)/.exec(text(html));
  const table = (html.split(/<caption>/)[1] || "").split("</table>")[0];
  const termCodes = [...table.matchAll(/<td[^>]*>\s*([A-Z]{2,5}-\d+[A-Z]*)\s*<\/td>/g)].map((m) => fromDashed(m[1]));

  let pdfCodes = [];
  const tmp = path.join(os.tmpdir(), `dei-list-${process.pid}.pdf`);
  try {
    fs.writeFileSync(tmp, await get(DEI_PDF, "buffer"));
    const out = execFileSync("pdftotext", ["-layout", tmp, "-"], { encoding: "utf8" });
    pdfCodes = deiCodesFromPdfText(out);
  } catch (err) {
    console.log(`  DEI PDF not read (${err.code === "ENOENT" ? "pdftotext is not installed" : err.message}) — using this quarter's table only`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }

  return {
    codes: [...new Set([...pdfCodes, ...termCodes])].sort(),
    term: {
      name: asOf ? asOf[1] : caption ? caption[1].replace(/\s*DEI Courses Offered\s*$/i, "") : null,
      asOf: asOf ? asOf[2] : null,
      codes: termCodes,
    },
    source: "UCSD Academic Senate, Diversity, Equity & Inclusion approved courses",
    url: DEI_PDF,
    termUrl: DEI_PAGE,
    retrieved: new Date().toISOString().slice(0, 10),
  };
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const ahi = await fetchAhi();
  console.log(`  AHI  ${ahi.codes.length} listed courses, plus any course under ${ahi.anyUnder.join(", ") || "—"}`);
  const dei = await fetchDei();
  console.log(`  DEI  ${dei.codes.length} approved courses (${dei.term.codes.length} on the ${dei.term.name ?? "current"} table, as of ${dei.term.asOf ?? "?"})`);
  fs.writeFileSync(OUT, JSON.stringify({ ahi, dei }));
  console.log(`  wrote ${path.relative(ROOT, OUT)}`);
}

// Importable for tests; runs only as a script.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`\nfetch-requirements failed: ${err.message}`);
    process.exit(1);
  });
}

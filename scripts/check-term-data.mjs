#!/usr/bin/env node
/**
 * Checks the published quarters hang together before they are published.
 *
 * For every term in public/data/plat/terms.json built from the public
 * schedule: its index names the term and carries the manifest's version;
 * every subject the index lists has a file, of the same term and version,
 * whose courses are exactly the index's rows for that subject; every listing
 * has its sections, every section a term-qualified ref; and the counts in the
 * manifest are what the files hold. The shared (Fall 2026) entry must point
 * at the shared index.
 *
 * Exits 1 listing every problem; writes a short Markdown report with --report.
 *
 * Run: node scripts/check-term-data.mjs [--report report.md]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLAT = path.join(ROOT, "public", "data", "plat");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

export function checkTerms(plat = PLAT) {
  const problems = [];
  const lines = [];
  const manifest = readJson(path.join(plat, "terms.json"));
  const shared = readJson(path.join(plat, "index.json")).meta;
  const codes = manifest.terms.map((t) => t.code);
  if (new Set(codes).size !== codes.length) problems.push(`terms.json lists a term twice: ${codes.join(", ")}`);
  for (const entry of manifest.terms) {
    if (entry.path === null) {
      if (entry.code !== shared.term) problems.push(`terms.json says the shared files are ${entry.code}; they are ${shared.term}`);
      lines.push(`- ${entry.name} (${entry.code}): the shared dataset, kept as built ${entry.refreshed ?? "?"}`);
      continue;
    }
    const dir = path.join(plat, entry.path);
    const where = (rel) => `${entry.path}/${rel}`;
    if (!fs.existsSync(path.join(dir, "index.json"))) { problems.push(`${where("index.json")} is missing`); continue; }
    const index = readJson(path.join(dir, "index.json"));
    if (index.meta.term !== entry.code) problems.push(`${where("index.json")} is for ${index.meta.term}`);
    if (index.meta.v !== entry.v) problems.push(`${where("index.json")} is version ${index.meta.v}, terms.json says ${entry.v}`);
    const rowsBySubject = new Map();
    for (const r of index.courses) {
      if (!rowsBySubject.has(r.s)) rowsBySubject.set(r.s, new Set());
      rowsBySubject.get(r.s).add(r.k);
    }
    let sections = 0;
    let meetings = 0;
    let listings = 0;
    const refs = new Set();
    for (const s of index.meta.subjects) {
      const file = path.join(dir, "subject", `${s.code}.json`);
      if (!fs.existsSync(file)) { problems.push(`${where(`subject/${s.code}.json`)} is missing`); continue; }
      const sub = readJson(file);
      if (sub.term !== entry.code || sub.v !== entry.v) problems.push(`${where(`subject/${s.code}.json`)} is ${sub.term} ${sub.v}`);
      const want = rowsBySubject.get(s.code) ?? new Set();
      const have = new Set(Object.keys(sub.courses));
      const extra = [...have].filter((k) => !want.has(k));
      const lacking = [...want].filter((k) => !have.has(k));
      if (extra.length || lacking.length) problems.push(`${s.code}: courses differ from the index (${[...extra.map((k) => `+${k}`), ...lacking.map((k) => `-${k}`)].slice(0, 6).join(", ")})`);
      if (s.offered !== have.size) problems.push(`${s.code}: index says ${s.offered} offered, file has ${have.size}`);
      for (const [code, c] of Object.entries(sub.courses)) {
        if (!Array.isArray(c.listings) || !c.listings.length) { problems.push(`${code} has no listings`); continue; }
        for (const l of c.listings) {
          listings++;
          if (l.sections.length !== l.section_count) problems.push(`${code} ${l.module_code}: ${l.sections.length} of ${l.section_count} sections`);
          for (const x of l.sections) {
            if (x.section_ref !== `${entry.code}:${x.section_id}`) problems.push(`${code}: section ref ${x.section_ref}`);
            if (refs.has(x.section_ref)) problems.push(`${code}: ${x.section_ref} twice`);
            refs.add(x.section_ref);
            sections++;
            meetings += x.meetings.length;
          }
        }
      }
    }
    const counted = { listings, courses: index.courses.length, sections, meetings, subjects: index.meta.subjects.length };
    for (const [k, v] of Object.entries(counted)) {
      if (entry.counts?.[k] !== v) problems.push(`${entry.code}: terms.json says ${entry.counts?.[k]} ${k}, the files hold ${v}`);
    }
    const gap = entry.summary
      ? ` UCSD's summary: ${entry.summary.courses}/${entry.summary.sections}/${entry.summary.meetings} (difference ${entry.summary.courses - counted.courses}/${entry.summary.sections - counted.sections}/${entry.summary.meetings - counted.meetings}).`
      : "";
    lines.push(`- ${entry.name} (${entry.code}), ${entry.v}: ${listings} listings, ${counted.courses} courses, ${sections} sections, ${meetings} meetings, ${counted.subjects} subjects.${gap}`);
  }
  return { problems, lines };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--report");
  const { problems, lines } = checkTerms();
  const report = [
    "### Published quarters",
    ...lines,
    ...(problems.length ? ["", `**${problems.length} problem(s):**`, ...problems.slice(0, 40).map((p) => `- ${p}`)] : []),
  ].join("\n");
  console.log(report);
  if (i >= 0 && argv[i + 1]) fs.writeFileSync(argv[i + 1], `${report}\n`);
  process.exit(problems.length ? 1 : 0);
}

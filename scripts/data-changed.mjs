#!/usr/bin/env node
/**
 * Whether a rebuilt dataset says anything the published one does not.
 *
 * A rebuild always stamps when its sources were read — Class Planner's
 * refresh time, the grade archive's retrieval date, the requirement lists'.
 * Those alone are not news, and publishing them would mean a commit and a
 * deploy every day for nothing, so they are set aside before comparing.
 * Everything else counts, the seat counts' own times included: "seats as of"
 * should move when UCSD recounted them, even if no number changed.
 *
 * Exits 0 and lists what changed when something did, 3 when nothing did.
 *
 * Run: node scripts/data-changed.mjs <previous dataset dir> [<new dataset dir>]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [before, after = path.join(ROOT, "public", "data", "plat")] = process.argv.slice(2);
if (!before) {
  console.error("usage: node scripts/data-changed.mjs <previous dataset dir> [<new dataset dir>]");
  process.exit(2);
}

/** The read-at stamps, per file. */
const STAMPS = {
  "index.json": (j) => {
    if (!j.meta) return;
    delete j.meta.refreshed;
    delete j.meta.generated;
    // Each source line repeats its read-at time; the counts in them are compared elsewhere.
    delete j.meta.sources;
  },
  "ge.json": (j) => {
    for (const part of Object.values(j.meta?.campus || {})) delete part.retrieved;
  },
};

/** Every file under `dir`, as paths relative to it. */
function files(dir, sub = "") {
  if (!fs.existsSync(path.join(dir, sub))) return [];
  return fs.readdirSync(path.join(dir, sub), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(dir, path.join(sub, e.name)) : [path.join(sub, e.name).split(path.sep).join("/")],
  );
}

function normalised(dir, rel) {
  const file = path.join(dir, rel);
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, "utf8");
  if (!rel.endsWith(".json") || !STAMPS[rel]) return text;
  const json = JSON.parse(text);
  STAMPS[rel](json);
  return JSON.stringify(json);
}

const changed = [...new Set([...files(before), ...files(after)])]
  .sort()
  .filter((rel) => normalised(before, rel) !== normalised(after, rel));

if (!changed.length) {
  console.log("  nothing changed but the times the sources were read");
  process.exit(3);
}
const shown = changed.slice(0, 12).join(", ") + (changed.length > 12 ? `, and ${changed.length - 12} more` : "");
console.log(`  ${changed.length} file(s) changed: ${shown}`);

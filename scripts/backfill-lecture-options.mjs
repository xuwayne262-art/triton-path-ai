/**
 * Adds `nl` and `pp` (see lecture-options.mjs) to an index.json built before
 * build-plat-data.mjs wrote them, from the subject files already published.
 * Idempotent; the next scheduled rebuild writes the same fields itself.
 *
 *   node scripts/backfill-lecture-options.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lectureOptions } from "./lecture-options.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "data", "plat");
const indexPath = path.join(OUT, "index.json");
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const subjects = new Map();
let changed = 0;
for (const row of index.courses) {
  if (!row.o) continue;
  if (!subjects.has(row.s)) {
    const file = path.join(OUT, "subject", `${row.s}.json`);
    subjects.set(row.s, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null);
  }
  const detail = subjects.get(row.s)?.courses?.[row.k];
  if (!detail) continue;
  const { nl, pp } = lectureOptions(detail.sec, row.p);
  if (nl > 1) row.nl = nl; else delete row.nl;
  if (pp.length) row.pp = pp; else delete row.pp;
  changed++;
}
fs.writeFileSync(indexPath, JSON.stringify(index));
console.log(`lecture options written for ${changed} offered courses`);

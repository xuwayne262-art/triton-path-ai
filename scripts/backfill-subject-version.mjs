/**
 * Stamps every published subject file with the index's build time (`v`), for
 * a dataset built before build-plat-data.mjs wrote it. Idempotent; the next
 * scheduled rebuild writes the same field itself.
 *
 *   node scripts/backfill-subject-version.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "data", "plat");
const v = JSON.parse(fs.readFileSync(path.join(OUT, "index.json"), "utf8")).meta?.retrieved;
if (!v) {
  console.error("index.json has no meta.retrieved to stamp with");
  process.exit(1);
}
let n = 0;
for (const name of fs.readdirSync(path.join(OUT, "subject"))) {
  if (!name.endsWith(".json")) continue;
  const file = path.join(OUT, "subject", name);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, JSON.stringify({ v, ...Object.fromEntries(Object.entries(json).filter(([k]) => k !== "v")) }));
  n++;
}
console.log(`stamped ${n} subject files with ${v}`);

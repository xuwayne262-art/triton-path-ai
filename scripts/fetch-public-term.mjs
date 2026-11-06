#!/usr/bin/env node
/**
 * Captures one term of UCSD's public schedule into a new directory.
 *
 *   node scripts/fetch-public-term.mjs WI27 [dest]
 *
 * `dest` must not exist (default: .data-cache/terms/<TERM>/<UTC time>). The
 * capture is staged beside it and moved into place only when it verifies
 * (see scripts/lib/public-term.mjs), so a failed run leaves nothing behind.
 * Prints the capture's counts, UCSD's own term summary, and the difference.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureTerm } from "./lib/public-term.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [term, dest] = process.argv.slice(2);
if (!term) {
  console.error("usage: node scripts/fetch-public-term.mjs <TERM> [dest]");
  process.exit(2);
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = path.resolve(dest || path.join(ROOT, ".data-cache", "terms", term, stamp));

captureTerm(term, out, { log: (s) => process.stdout.write(s) })
  .then((coverage) => {
    console.log(JSON.stringify(coverage, null, 2));
    console.log(`  captured into ${path.relative(ROOT, out)}`);
  })
  .catch((err) => {
    console.error(`\nfetch-public-term failed: ${err.message}`);
    process.exit(1);
  });

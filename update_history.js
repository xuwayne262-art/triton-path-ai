const fs   = require("fs");
const path = require("path");

// ── Config ────────────────────────────────────────────────────────────────────

const COURSES_PATH  = path.join(__dirname, "data", "courses.json");
const HISTORY_DIR   = path.join(__dirname, "data", "history");
const COURSE_REGEX  = /[A-Z]{3,4}\s\d{1,3}[A-Z]?/g;

const TERM_MAP = { FA: "Fall", WI: "Winter", SP: "Spring" };

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip ALL .txt extensions so "FA25.txt.txt" → "FA25" */
function stemName(filename) {
  let stem = filename;
  while (stem.toLowerCase().endsWith(".txt")) {
    stem = stem.slice(0, -4);
  }
  return stem;
}

/**
 * Parse a stem like "FA25" or "WI26" into { term: "Fall", year: "2025" }.
 * Returns null if the stem doesn't match the expected pattern.
 */
function parseStem(stem) {
  const match = stem.match(/^(FA|WI|SP)(\d{2})$/i);
  if (!match) return null;
  const prefix = match[1].toUpperCase();
  const year   = "20" + match[2];
  const term   = TERM_MAP[prefix];
  if (!term) return null;
  return { term, year, label: `${term} ${year}` };
}

// ── Main ──────────────────────────────────────────────────────────────────────

// 1. Read courses.json
const courses = JSON.parse(fs.readFileSync(COURSES_PATH, "utf8"));

// Build a fast lookup map: course id → course object
const courseMap = {};
for (const course of courses) {
  courseMap[course.id] = course;
  // Ensure the field exists
  if (!Array.isArray(course.historicalTermsOffered)) {
    course.historicalTermsOffered = [];
  }
}

// 2. Read every file in data/history/
const entries = fs.readdirSync(HISTORY_DIR);
let filesProcessed = 0;

for (const filename of entries) {
  const fullPath = path.join(HISTORY_DIR, filename);
  if (!fs.statSync(fullPath).isFile()) continue;

  const stem = stemName(filename);
  const parsed = parseStem(stem);

  if (!parsed) {
    console.warn(`  ⚠  Skipping "${filename}" — cannot determine term from name "${stem}"`);
    continue;
  }

  const { label } = parsed;
  const text = fs.readFileSync(fullPath, "utf8");

  // 3. Extract course codes via regex
  const found = text.match(COURSE_REGEX) ?? [];
  const unique = [...new Set(found)];

  let matched = 0;

  // 4 & 5. Update historicalTermsOffered for each matched course
  for (const code of unique) {
    const course = courseMap[code];
    if (!course) continue;

    if (!course.historicalTermsOffered.includes(label)) {
      course.historicalTermsOffered.push(label);
      matched++;
    }
  }

  console.log(`✓  ${filename.padEnd(22)} → ${label}  |  ${unique.length} codes found, ${matched} courses updated`);
  filesProcessed++;
}

// 6. Save updated courses.json
fs.writeFileSync(COURSES_PATH, JSON.stringify(courses, null, 2));

console.log(`\nDone — ${filesProcessed} file(s) processed. courses.json saved.\n`);

#!/usr/bin/env node
/**
 * Builds src/data/departmentOfferings.ts from the UCSD registrar's
 * "Projected Course Offerings for Fall 2026" sheet.
 *
 * Fall 2026 is the term the Triton Student System came online, and the registrar
 * held the real Schedule of Classes back until mid-July as a result. In the
 * meantime each department publishes its own tentative list, and that sheet is
 * the index of where. Our own FA26 data is a snapshot of a moving target, so a
 * department page should be able to point a student at the authority for it.
 *
 * The CSV export carries the text but drops the hyperlinks, and several rows
 * ("2026-27 Course Offerings") are link text with no URL in the cell at all —
 * so the URLs are recovered from the xlsx, where they survive as cell relations.
 *
 * Run: node scripts/fetch-dept-offerings.mjs
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".data-cache");
const OUT = path.join(ROOT, "src", "data", "departmentOfferings.ts");

const SHEET_ID = "1gjezK4NlqWyZzjSFd2qGTcCgM4YduZLL";
const GID = "881933084";
const HUMAN_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${GID}`;
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
const XLSX_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;

/** Data rows begin on the third spreadsheet row, under the notice and header. */
const FIRST_DATA_ROW = 3;

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Minimal zip reader — enough to pull two known entries out of an xlsx. */
function unzip(buf, wanted) {
  const found = {};
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) !== 0x06054b50) continue;
    let offset = buf.readUInt32LE(i + 16);
    const count = buf.readUInt16LE(i + 10);
    for (let n = 0; n < count; n++) {
      if (buf.readUInt32LE(offset) !== 0x02014b50) break;
      const method = buf.readUInt16LE(offset + 10);
      const compSize = buf.readUInt32LE(offset + 20);
      const nameLen = buf.readUInt16LE(offset + 28);
      const extraLen = buf.readUInt16LE(offset + 30);
      const commentLen = buf.readUInt16LE(offset + 32);
      const localOff = buf.readUInt32LE(offset + 42);
      const name = buf.subarray(offset + 46, offset + 46 + nameLen).toString("utf8");
      if (wanted.includes(name)) {
        const lNameLen = buf.readUInt16LE(localOff + 26);
        const lExtraLen = buf.readUInt16LE(localOff + 28);
        const start = localOff + 30 + lNameLen + lExtraLen;
        const raw = buf.subarray(start, start + compSize);
        found[name] = method === 0 ? raw : zlib.inflateRawSync(raw);
      }
      offset += 46 + nameLen + extraLen + commentLen;
    }
    break;
  }
  return found;
}

const UA = "UCSDPlans data build (student course tool; contact via repo)";

/**
 * Google serves these exports over a redirect chain that Node's fetch cannot
 * always negotiate from behind a proxy, so curl is the fallback rather than the
 * failure.
 */
async function get(url, asBuffer = false) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return asBuffer ? Buffer.from(await res.arrayBuffer()) : await res.text();
  } catch (err) {
    const tmp = path.join(CACHE, `dl-${Date.now()}.tmp`);
    fs.mkdirSync(CACHE, { recursive: true });
    try {
      execFileSync("curl", ["-sSL", "--max-time", "60", "-A", UA, "-o", tmp, url], { stdio: "pipe" });
      const buf = fs.readFileSync(tmp);
      if (!buf.length) throw new Error("empty response");
      return asBuffer ? buf : buf.toString("utf8");
    } catch (curlErr) {
      throw new Error(`${url}: ${err.message}; curl fallback: ${curlErr.message}`);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
}

/** cell ref ("C7") -> external URL, from the worksheet's hyperlink relations. */
function hyperlinksByCell(xlsx) {
  const parts = unzip(xlsx, ["xl/worksheets/sheet1.xml", "xl/worksheets/_rels/sheet1.xml.rels"]);
  const rels = new Map();
  const relsXml = (parts["xl/worksheets/_rels/sheet1.xml.rels"] || "").toString("utf8");
  for (const m of relsXml.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*TargetMode="External"/g)) {
    rels.set(m[1], m[2].replace(/&amp;/g, "&"));
  }
  const byCell = new Map();
  const sheetXml = (parts["xl/worksheets/sheet1.xml"] || "").toString("utf8");
  for (const m of sheetXml.matchAll(/<hyperlink[^>]*r:id="([^"]+)"[^>]*ref="([A-Z]+\d+)"/g)) {
    if (rels.has(m[1])) byCell.set(m[2], rels.get(m[1]));
  }
  // The attributes appear in either order depending on the exporter.
  for (const m of sheetXml.matchAll(/<hyperlink[^>]*ref="([A-Z]+\d+)"[^>]*r:id="([^"]+)"/g)) {
    if (rels.has(m[2])) byCell.set(m[1], rels.get(m[2]));
  }
  return byCell;
}

const ts = (v) => (v == null ? "null" : JSON.stringify(v));

async function main() {
  const [csv, xlsx] = await Promise.all([get(CSV_URL), get(XLSX_URL, true)]);
  const rows = parseCsv(csv);
  const links = hyperlinksByCell(xlsx);

  const notice = (rows[0]?.[0] || "").replace(/\s+/g, " ").trim();
  const headerAt = rows.findIndex((r) => (r[0] || "").trim() === "Department");
  const data = rows.slice(headerAt + 1).filter((r) => (r[0] || "").trim());

  const entries = data.map((r, i) => {
    const sheetRow = FIRST_DATA_ROW + i;
    const text = (r[2] || "").replace(/\s+/g, " ").trim();
    const inText = /(https?:\/\/[^\s,;]+)/.exec(text);
    const url = links.get(`C${sheetRow}`) || (inText ? inText[1] : null);
    // When the cell is just the URL, the URL is not also a useful label.
    const label = text && !/^https?:\/\/\S+$/.test(text) ? text : null;
    return {
      department: r[0].trim(),
      subjects: (r[1] || "").split(/[,;]/).map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-Z]{2,6}$/.test(s)),
      url,
      label,
      note: (r[3] || "").replace(/\s+/g, " ").trim() || null,
    };
  });

  const withUrl = entries.filter((e) => e.url).length;
  const body = `// Generated by scripts/fetch-dept-offerings.mjs — do not edit by hand.
// Source: UCSD registrar, "Projected Course Offerings for Fall 2026"
// ${HUMAN_URL}

export interface DepartmentOffering {
  /** Department name as the registrar lists it. */
  department: string;
  /** Subject codes the department owns. */
  subjects: string[];
  /** Where the department publishes its own tentative offerings. */
  url: string | null;
  /** Cell text, when it describes the link rather than repeating it. */
  label: string | null;
  /** The registrar's caveat for this row, where there is one. */
  note: string | null;
}

/** The registrar's standing caveat for every row in this table. */
export const OFFERINGS_NOTICE =
  ${ts(notice)};

export const OFFERINGS_SOURCE = {
  name: 'UCSD registrar, "Projected Course Offerings for Fall 2026"',
  url: ${ts(HUMAN_URL)},
  retrieved: ${ts(new Date().toISOString().slice(0, 10))},
} as const;

export const DEPARTMENT_OFFERINGS: DepartmentOffering[] = [
${entries.map((e) => `  {
    department: ${ts(e.department)},
    subjects: [${e.subjects.map(ts).join(", ")}],
    url: ${ts(e.url)},
    label: ${ts(e.label)},
    note: ${ts(e.note)},
  },`).join("\n")}
];

const BY_SUBJECT = new Map<string, DepartmentOffering>();
for (const entry of DEPARTMENT_OFFERINGS) {
  for (const code of entry.subjects) if (!BY_SUBJECT.has(code)) BY_SUBJECT.set(code, entry);
}

/** The department listing that covers a subject code, if the registrar names one. */
export function offeringsForSubject(code: string): DepartmentOffering | null {
  return BY_SUBJECT.get(code.toUpperCase()) ?? null;
}

/** The first listing among a department's subject codes that carries a link. */
export function offeringsForSubjects(codes: string[]): DepartmentOffering | null {
  for (const code of codes) {
    const hit = offeringsForSubject(code);
    if (hit && hit.url) return hit;
  }
  for (const code of codes) {
    const hit = offeringsForSubject(code);
    if (hit) return hit;
  }
  return null;
}
`;

  fs.writeFileSync(OUT, body);
  console.log(`${entries.length} departments (${withUrl} with a link, ${entries.reduce((n, e) => n + e.subjects.length, 0)} subject codes)`);
  console.log(`-> ${path.relative(ROOT, OUT)}`);
}

await main();

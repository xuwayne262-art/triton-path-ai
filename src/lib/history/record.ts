import type { HistoryCourse, HistoryTerm, ParsedHistory, TransferCourse } from "./parse";

/**
 * What the server will accept as a saved Academic History.
 *
 * The parse runs in the student's browser, so what arrives here is whatever a
 * caller chose to send — it has no more authority than any other request body.
 * This module rebuilds the record field by field from scratch rather than
 * trusting the object it was handed: anything unrecognised is dropped, and
 * every number is re-derived rather than read.
 *
 * The limits are deliberately generous enough for a real six-year record and
 * tight enough that the store cannot be used as free hosting.
 */

export const MAX_BODY_BYTES = 128 * 1024;
const MAX_TERMS = 40;
const MAX_COURSES_PER_TERM = 20;
const MAX_TRANSFER = 80;
const MAX_WARNINGS = 40;
const MAX_TEXT = 120;
const MAX_UNITS = 30;

export interface StoredHistory extends ParsedHistory {
  /** When the student last imported, ISO-8601. Set by the server, not sent. */
  savedAt: string;
  /** Schema version, so a later shape change can migrate rather than guess. */
  v: 1;
}

const str = (v: unknown, max = MAX_TEXT): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

const optStr = (v: unknown, max = MAX_TEXT): string | null => str(v, max) || null;

/** Finite, non-negative, capped. NaN and Infinity become 0, never propagate. */
const unit = (v: unknown, max = MAX_UNITS): number => {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(Math.min(n, max) * 100) / 100;
};

const list = <T,>(v: unknown, max: number, map: (x: unknown) => T | null): T[] => {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const item of v.slice(0, max)) {
    const mapped = map(item);
    if (mapped !== null) out.push(mapped);
  }
  return out;
};

const STATUSES = new Set(["graded", "pass", "fail", "withdrawn", "progress", "other"]);

function course(v: unknown): HistoryCourse | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  const subject = str(c.subject, 8).toUpperCase();
  const number = str(c.number, 8).toUpperCase();
  if (!subject || !number) return null;
  const status = str(c.status, 12);
  return {
    code: `${subject} ${number}`,
    subject,
    number,
    title: str(c.title),
    units: unit(c.units),
    grade: optStr(c.grade, 4),
    points: c.points == null ? null : unit(c.points, 200),
    status: (STATUSES.has(status) ? status : "other") as HistoryCourse["status"],
  };
}

function term(v: unknown): HistoryTerm | null {
  if (!v || typeof v !== "object") return null;
  const t = v as Record<string, unknown>;
  const code = str(t.code, 6).toUpperCase();
  if (!code) return null;
  const courses = list(t.courses, MAX_COURSES_PER_TERM, course);
  if (!courses.length) return null;
  return { code, label: str(t.label, 40) || code, courses };
}

function transfer(v: unknown): TransferCourse | null {
  if (!v || typeof v !== "object") return null;
  const t = v as Record<string, unknown>;
  const title = str(t.title);
  const from = str(t.from, 60);
  if (!title && !from) return null;
  return {
    code: optStr(t.code, 12),
    title,
    units: unit(t.units),
    from: from || "Transfer",
    level: optStr(t.level, 4),
    equivalents: list(t.equivalents, 12, (x) => optStr(x, 40)),
  };
}

/**
 * Rebuilds a clean record, or null when nothing survived.
 *
 * Totals are recomputed here and never taken from the body: a caller that sent
 * "unitsEarned: 900" would otherwise have it echoed back as fact on the
 * student's own dashboard.
 */
export function sanitizeHistory(body: unknown): StoredHistory | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  const terms = list(b.terms, MAX_TERMS, term);
  const transferRows = list(b.transfer, MAX_TRANSFER, transfer);
  if (!terms.length && !transferRows.length) return null;

  let unitsEarned = 0;
  let unitsInProgress = 0;
  let qualityPoints = 0;
  let gpaUnits = 0;
  let courses = 0;

  const POINTS: Record<string, number> = {
    "A+": 4, A: 4, "A-": 3.7, "B+": 3.3, B: 3, "B-": 2.7,
    "C+": 2.3, C: 2, "C-": 1.7, "D+": 1.3, D: 1, "D-": 0.7, F: 0,
  };

  for (const t of terms) {
    for (const c of t.courses) {
      courses++;
      if (c.status === "graded" || c.status === "pass") unitsEarned += c.units;
      if (c.status === "progress") unitsInProgress += c.units;
      const p = c.grade ? POINTS[c.grade.toUpperCase()] : undefined;
      if (p !== undefined) {
        qualityPoints += p * c.units;
        gpaUnits += c.units;
      }
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    v: 1,
    savedAt: new Date().toISOString(),
    college: optStr(b.college, 60),
    majors: list(b.majors, 6, (x) => optStr(x, 80)),
    minors: list(b.minors, 6, (x) => optStr(x, 80)),
    terms,
    transfer: transferRows,
    warnings: list(b.warnings, MAX_WARNINGS, (x) => optStr(x, 200)),
    totals: {
      courses,
      unitsEarned: round2(unitsEarned),
      unitsInProgress: round2(unitsInProgress),
      transferUnits: round2(transferRows.reduce((n, t) => n + t.units, 0)),
      gpa: gpaUnits > 0 ? round2(qualityPoints / gpaUnits) : null,
    },
  };
}

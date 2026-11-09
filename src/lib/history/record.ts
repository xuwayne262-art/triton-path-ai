import { computeTotals, effectiveStatus } from "./attempts";
import { isTermCode } from "./terms";
import { isIsoDate, todayInSanDiego } from "@/lib/housing/terms";
import {
  REVIEW_REASONS,
  type HistoryCourse, type HistorySource, type HistoryTerm, type ParsedHistory, type ReviewReason, type TransferCourse,
} from "./types";

/**
 * What the server will accept as a saved Academic History.
 *
 * The parse runs in the student's browser, so what arrives here is whatever a
 * caller chose to send — it has no more authority than any other request body.
 * This module rebuilds the record field by field from scratch rather than
 * trusting the object it was handed: anything unrecognised is dropped, and
 * every number is re-derived rather than read. A course's status is worked
 * out again from its grade and its term's dates, so a label like "graded"
 * next to an F earns nothing.
 *
 * Nothing the paste said in its own words is kept: the review screen's list
 * of unread lines stays in the browser, because those lines are the student's
 * page, not course records.
 *
 * The limits are deliberately generous enough for a real six-year record and
 * tight enough that the store cannot be used as free hosting.
 */

export const MAX_BODY_BYTES = 128 * 1024;
const MAX_TERMS = 40;
const MAX_COURSES_PER_TERM = 20;
const MAX_TRANSFER = 80;
const MAX_TEXT = 120;
const MAX_UNITS = 30;

/** The shape version written now. Version 1 records read the same way. */
export const HISTORY_VERSION = 2;

export interface StoredHistory extends ParsedHistory {
  /** When the student last saved, ISO-8601. Set by the server, not sent. */
  savedAt: string;
  /** Schema version, so a later shape change can migrate rather than guess. */
  v: 1 | 2;
}

const str = (v: unknown, max = MAX_TEXT): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

const optStr = (v: unknown, max = MAX_TEXT): string | null => str(v, max) || null;

/** Finite, non-negative, capped. NaN and Infinity become 0, never propagate. */
const unit = (v: unknown, max = MAX_UNITS): number => {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(Math.min(n, max) * 10000) / 10000;
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

const SUBJECT = /^[A-Z]{1,6}$/;
const NUMBER = /^[0-9A-Z]{1,6}$/;
const GRADE = /^[A-Z]{1,3}[+-]?$/;
const REASONS = new Set<string>(REVIEW_REASONS);
const SOURCES = new Set<HistorySource>(["tss", "legacy", "manual"]);

function course(v: unknown): HistoryCourse | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  const subject = str(c.subject, 8).toUpperCase();
  const number = str(c.number, 8).toUpperCase();
  if (!SUBJECT.test(subject) || !NUMBER.test(number)) return null;
  const grade = str(c.grade, 4).toUpperCase();
  const review = list(c.review, 5, (x) => (typeof x === "string" && REASONS.has(x) ? (x as ReviewReason) : null));
  const out: HistoryCourse = {
    code: `${subject} ${number}`,
    subject,
    number,
    title: str(c.title),
    units: unit(c.units),
    grade: GRADE.test(grade) ? grade : null,
    points: c.points == null ? null : unit(c.points, 200),
    // Set from the grade and the term in term() below; never taken from the body.
    status: "other",
  };
  const src = str(c.src, 16);
  if (src && src !== out.code) out.src = src;
  const option = str(c.option, 40);
  if (option) out.option = option;
  if (c.cnv === true) out.cnv = true;
  if (review.length) out.review = [...new Set(review)];
  if (c.unmatched === true) out.unmatched = true;
  if (c.manual === true) out.manual = true;
  // A grade the body carried that is not grade-shaped is not dropped silently.
  if (!out.grade && grade) out.review = [...new Set([...(out.review ?? []), "unknown-grade" as const])];
  return out;
}

function term(v: unknown, today: string): HistoryTerm | null {
  if (!v || typeof v !== "object") return null;
  const t = v as Record<string, unknown>;
  const code = str(t.code, 6).toUpperCase();
  if (!isTermCode(code) && code !== "XFER") return null;
  const start = isIsoDate(t.start) ? t.start : undefined;
  const end = isIsoDate(t.end) && (!start || t.end >= start) ? t.end : undefined;
  const dated = { code, ...(start && end ? { start, end } : {}) };
  // One attempt per course per term: a second copy is the same attempt.
  const seen = new Set<string>();
  const courses = list(t.courses, MAX_COURSES_PER_TERM, course)
    .filter((c) => (seen.has(c.code) ? false : (seen.add(c.code), true)))
    .map((c) => ({ ...c, status: effectiveStatus(c, dated, today) }));
  if (!courses.length) return null;
  return { ...dated, label: str(t.label, 40) || code, courses };
}

function transfer(v: unknown): TransferCourse | null {
  if (!v || typeof v !== "object") return null;
  const t = v as Record<string, unknown>;
  const title = str(t.title);
  const from = str(t.from, 60);
  if (!title && !from) return null;
  const out: TransferCourse = {
    code: optStr(t.code, 12),
    title,
    units: unit(t.units),
    from: from || "Transfer",
    level: optStr(t.level, 4),
    equivalents: list(t.equivalents, 12, (x) => optStr(x, 40)),
  };
  if (t.manual === true) out.manual = true;
  return out;
}

/**
 * Rebuilds a clean record, or null when nothing survived.
 *
 * Totals are recomputed here and never taken from the body: a caller that sent
 * "unitsEarned: 900" would otherwise have it echoed back as fact on the
 * student's own dashboard.
 */
export function sanitizeHistory(body: unknown, today = todayInSanDiego()): StoredHistory | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  // A term listed twice is one term: its courses are put together.
  const byCode = new Map<string, HistoryTerm>();
  for (const t of list(b.terms, MAX_TERMS, (x) => term(x, today))) {
    const prior = byCode.get(t.code);
    if (!prior) { byCode.set(t.code, t); continue; }
    for (const c of t.courses) {
      if (prior.courses.length < MAX_COURSES_PER_TERM && !prior.courses.some((p) => p.code === c.code)) prior.courses.push(c);
    }
  }
  const terms = [...byCode.values()];
  const transferRows = list(b.transfer, MAX_TRANSFER, transfer);
  if (!terms.length && !transferRows.length) return null;

  const source = SOURCES.has(b.source as HistorySource) ? (b.source as HistorySource) : undefined;
  const planStart = typeof b.planStart === "number" && Number.isInteger(b.planStart) && b.planStart >= 1990 && b.planStart <= 2100
    ? b.planStart
    : undefined;

  const record: StoredHistory = {
    v: HISTORY_VERSION,
    savedAt: new Date().toISOString(),
    college: optStr(b.college, 60),
    majors: list(b.majors, 6, (x) => optStr(x, 80)),
    minors: list(b.minors, 6, (x) => optStr(x, 80)),
    terms,
    transfer: transferRows,
    warnings: [],
    totals: { courses: 0, unitsEarned: 0, unitsInProgress: 0, transferUnits: 0, gpa: null },
    ...(source ? { source } : {}),
    ...(planStart ? { planStart } : {}),
  };
  const totals = computeTotals(record, today);
  // TSS shows no GPA yet, and a partial paste's would be made up.
  record.totals = source === "tss" ? { ...totals, gpa: null } : totals;
  return record;
}

/**
 * What a save request carries. The current page sends
 * `{ history, base }`: the record and the savedAt it was merged into, so a
 * save made from a stale copy is refused instead of overwriting newer work.
 * A page from before that sends the record alone, which replaces as it
 * always did.
 */
export function readSaveBody(body: unknown): { history: unknown; base: string | null; checked: boolean } {
  if (body && typeof body === "object" && "history" in body) {
    const b = body as Record<string, unknown>;
    return { history: b.history, base: typeof b.base === "string" && b.base ? b.base : null, checked: true };
  }
  return { history: body, base: null, checked: false };
}

/** The savedAt of a stored record's text, or null when there is none or it cannot be read. */
export function savedAtOf(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const v = (JSON.parse(raw) as { savedAt?: unknown }).savedAt;
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
}

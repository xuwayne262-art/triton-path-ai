/**
 * Reads My Academic History as copied out of TSS (Triton Student System).
 *
 * WHAT A COPY LOOKS LIKE
 * Each quarter is a card headed by its academic year ("2026/2027 Fall
 * Quarter"), with its dates, a status ("Active", which says nothing about the
 * courses) and a table: Course, Course Title, Units, Grading Option, Grade,
 * Grade Points. Browsers copy that table as tab-separated lines, but not
 * always: some copies put every cell on its own line, a narrow table can wrap
 * "ECON-" away from "110B", and an editor can turn tabs into spaces. So the
 * page is read as a stream of cells, and a row is read cell by cell: a code,
 * a title (one or more cells), units, then the grading option, grade and
 * grade points, each of which may be absent.
 *
 * WHAT IT WILL NOT DO
 * - Put a row in a quarter it was not printed under. A row after "Academic
 *   Events" or "External Work", or before any heading, is kept and marked
 *   "no quarter" for the student to place.
 * - Read grade points as units, "CNV" as a grade, or "Active" as completion.
 * - Invent a grade. A blank grade stays blank (null); whether that means "in
 *   progress" or "missing" is decided by the term's dates.
 * - Keep the paste. Only courses come out; names, IDs and contact details on
 *   the same page are never read into the result.
 */

import { dateRange, datesFitTerm, termFromTssHeading } from "./terms";
import { numberFragment, splitCode, subjectFragment, type CodeParts } from "./codes";
import { GRADE_SHAPE, KNOWN_GRADES, expectedPoints, gradeStatus } from "./grades";
import type { GradeStatus, HistoryCourse, HistoryTerm, ReviewReason } from "./types";

export const TSS_PARSER = "tss-1";

/** About fifty times a long record; anything past it is not read, and the student is told. */
export const MAX_INPUT_CHARS = 400_000;
const MAX_LINES = 20_000;
const MAX_ROWS = 800;
const MAX_TITLE_CELLS = 6;

/** The pseudo-term for rows the paste printed under no quarter. Never saved. */
export const NO_QUARTER = "NOQTR";

export interface ReadMessage {
  level: "error" | "warn" | "info";
  code:
    | "TRUNCATED" | "NO_ROWS_TSS" | "NO_QUARTER" | "DATES_CONFLICT" | "PARTIAL_LIST"
    | "EXTERNAL_NOT_READ" | "DUPLICATES" | "CONFLICT" | "UNKNOWN_GRADE" | "POINTS_MISMATCH"
    | "NO_UNITS" | "AUDIT_TEXT" | "NOT_HISTORY" | "LEGACY_LINES" | "BY_COURSE";
  text: string;
}

export interface TssRead {
  terms: HistoryTerm[];
  /** Rows printed under no quarter, kept for the student to place. */
  unplaced: HistoryCourse[];
  messages: ReadMessage[];
  /** Same attempt copied twice (say, Current Bookings and Academic History), folded into one. */
  duplicates: number;
  /** External Work rows seen and not read. */
  externalRows: number;
}

// ── Cells ────────────────────────────────────────────────────────────────────

interface Cell {
  text: string;
  /** An empty cell between tabs: a value the table printed as blank. */
  blank: boolean;
}

const UNITS = /^\d{1,2}(?:\.\d{1,4})?$/;
const DECIMAL = /^\d{1,3}\.\d{1,4}$/;
const OPTION =
  /^(?:(cnv)\s*[-–]\s*)?(letter grade|letter|pass\s*\/\s*no pass|p\s*\/\s*np|satisfactory\s*\/\s*unsatisfactory|s\s*\/\s*u|audit|no grade|in progress grading)$/i;

/** A whole row typed on one line, cells joined by spaces: code, title, units with decimals, then the rest. */
const SPACED_ROW =
  /^(?:([A-Z]{2,5})\s*[-‐–]?\s*)?(\d{1,3}[A-Z]{0,3})\s+(.+?)\s+(\d{1,2}\.\d{2,4})(?:\s+(.*))?$/;
const SPACED_TAIL =
  /^(?:(?:(CNV)\s*[-–]\s*)?(Letter Grade|Pass\s*\/\s*No Pass|P\s*\/\s*NP|Satisfactory\s*\/\s*Unsatisfactory|S\s*\/\s*U))?\s*([A-Z]{1,3}[+-]?)?\s*(\d{1,3}\.\d{1,4})?$/;

const HEADER = new Set([
  "course", "course title", "title", "units", "grading option", "grade", "grade points",
  "course id", "credits",
]);

/** Words on the page that are never data. "Active" is a quarter's status, not a course's. */
const NOISE = new Set([
  "active", "inactive", "continuing", "completed", "enrolled", "booked", "dropped",
  "undergraduate", "graduate", "by quarter", "by course", "ascending", "descending",
  "more", "show more", "load more", "show less", "courses", "schedule", "make changes",
  "select academic period", "academic period", "sort", "filter", "expand", "collapse",
  "my academic history", "summary", "detail",
]);

type Section = "history" | "bookings" | "external" | "end";

const SECTIONS: Array<[RegExp, Section]> = [
  [/^academic history$/i, "history"],
  [/^current bookings$/i, "bookings"],
  [/^external work$/i, "external"],
  [/^(academic events|cumulative summary|admissions|degrees awarded|personal information|contact information|academic information|program type)$/i, "end"],
];

/** Lines like "For Fall 2026 forward - Data Pending." that only describe the page. */
const PROSE = /\b(data pending|degree audit|uachieve|can be viewed|not yet available)\b/i;

/** "[10 / 24]": a list that loaded 10 of its 24 rows. The brackets are required; "2026/2027" is a year. */
const LOADED = /^\[\s*(\d+)\s*\/\s*(\d+)\s*\]$/;

/** "2026/2027" alone: the first half of a heading split across two cells. */
const YEAR_PAIR = /^\d{4}\s*[/–-]\s*\d{4}$/;

/** A first cell holding a code and its title together: "BIEB-102 Intro Eclgy". */
const CODE_AND_TITLE = /^([A-Z]{2,5}\s*[-‐–]\s*\d{1,3}[A-Z]{0,3})\s+(\D.*)$/;

const clean = (s: string) => s.replace(/[ \t]+/g, " ").trim();

/**
 * The paste as cells. Tab-separated lines keep their empty cells, because a
 * blank grade is information; lines with no tabs are one cell, unless they
 * hold a whole row typed with spaces, which is split the way a table would.
 */
function toCells(lines: string[]): Cell[] {
  const cells: Cell[] = [];
  let prevSubjectFragment = false;
  for (const raw of lines) {
    if (raw.includes("\t")) {
      const parts = raw.split("\t").map(clean);
      // Leading empty cells are indentation, not columns.
      while (parts.length && !parts[0]) parts.shift();
      if (!parts.length) continue;
      const joined = CODE_AND_TITLE.exec(parts[0]);
      if (joined && parts.length > 1) parts.splice(0, 1, joined[1], joined[2]);
      for (const p of parts) cells.push({ text: p, blank: !p });
      prevSubjectFragment = parts.length === 1 && subjectFragment(parts[0]) !== null;
      continue;
    }
    const line = clean(raw);
    if (!line) continue;
    const spaced = SPACED_ROW.exec(line);
    // A number-led row continues a wrapped code ("ECON-" then "110B Title 4.00 ...").
    if (spaced && (spaced[1] || prevSubjectFragment) && !subjectFragment(line)) {
      const [, subject, number, title, units, tail] = spaced;
      const head = subject ? `${subject}-${number}` : number;
      cells.push({ text: head, blank: false }, { text: title, blank: false }, { text: units, blank: false });
      const t = tail ? SPACED_TAIL.exec(tail.trim()) : null;
      if (tail && t) {
        if (t[2]) cells.push({ text: t[1] ? `CNV - ${t[2]}` : t[2], blank: false });
        if (t[3]) cells.push({ text: t[3], blank: false });
        if (t[4]) cells.push({ text: t[4], blank: false });
      } else if (tail) {
        cells.push({ text: tail.trim(), blank: false });
      }
      prevSubjectFragment = false;
      continue;
    }
    cells.push({ text: line, blank: false });
    prevSubjectFragment = subjectFragment(line) !== null;
  }
  return cells;
}

// ── Rows ─────────────────────────────────────────────────────────────────────

interface Draft {
  parts: CodeParts;
  src: string;
  title: string[];
  units: number | null;
  option: string | null;
  cnv: boolean;
  grade: string | null;
  points: number | null;
  stage: "title" | "units" | "option" | "grade";
}

type Context =
  | { kind: "term"; code: string }
  | { kind: "none" | "bookings" | "end" | "external" };

const num = (s: string) => {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

const isGradeToken = (s: string) => GRADE_SHAPE.test(s);

/** A code starting at cells[i] (whole, or wrapped across two cells), and how many cells it used. */
function codeAt(cells: Cell[], i: number): { parts: CodeParts; src: string; used: number } | null {
  const c = cells[i];
  if (!c || c.blank) return null;
  const whole = splitCode(c.text);
  if (whole) return { parts: whole, src: c.text.replace(/\s+/g, ""), used: 1 };
  const subject = subjectFragment(c.text);
  const next = cells[i + 1];
  if (subject && next && !next.blank) {
    const number = numberFragment(next.text);
    if (number) return { parts: { subject, number }, src: `${subject}-${number}`, used: 2 };
  }
  return null;
}

export function readTss(raw: string): TssRead {
  const messages: ReadMessage[] = [];
  let text = String(raw ?? "");
  if (text.length > MAX_INPUT_CHARS) {
    text = text.slice(0, MAX_INPUT_CHARS);
    messages.push({ level: "warn", code: "TRUNCATED", text: "That paste was very long, so only its first part was read. Paste fewer quarters at a time." });
  }
  const lines = text
    .replace(/\r\n?/g, "\n")
    .replace(/[     ]/g, " ")
    .replace(/[​﻿]/g, "")
    .split("\n")
    .slice(0, MAX_LINES);
  const cells = toCells(lines);

  const terms = new Map<string, HistoryTerm>();
  const unplaced: HistoryCourse[] = [];
  let context: Context = { kind: "none" };
  let row: Draft | null = null;
  let duplicates = 0;
  let externalRows = 0;
  let rows = 0;
  let partial = false;

  const finish = () => {
    const d = row;
    row = null;
    if (!d || rows >= MAX_ROWS) return;
    if (context.kind === "external") {
      externalRows++;
      return;
    }
    rows++;
    const review: ReviewReason[] = [];
    if (d.units == null) review.push("no-units");
    const grade = d.grade ? d.grade.toUpperCase() : null;
    if (grade && !KNOWN_GRADES.has(grade)) review.push("unknown-grade");
    const units = d.units ?? 0;
    const expected = expectedPoints(grade, units);
    if (expected != null && d.points != null && Math.abs(expected - d.points) > 0.05) review.push("points-mismatch");
    const status: GradeStatus = gradeStatus(grade);
    const course: HistoryCourse = {
      code: `${d.parts.subject} ${d.parts.number}`,
      subject: d.parts.subject,
      number: d.parts.number,
      title: d.title.join(" ").replace(/\s+/g, " ").trim(),
      units,
      grade,
      points: d.points,
      status,
      src: d.src,
      ...(d.option ? { option: d.option } : {}),
      ...(d.cnv ? { cnv: true } : {}),
    };
    if (context.kind !== "term") {
      review.push("no-quarter");
      if (review.length) course.review = review;
      unplaced.push(course);
      return;
    }
    if (review.length) course.review = review;
    const term = terms.get(context.code)!;
    const twin = term.courses.find((c) => c.code === course.code);
    if (!twin) {
      term.courses.push(course);
      return;
    }
    // The same attempt copied twice: Current Bookings and Academic History,
    // or the same card pasted again. Folded into one, keeping what either has.
    duplicates++;
    if (twin.grade && course.grade && twin.grade !== course.grade) {
      twin.review = [...new Set([...(twin.review ?? []), "conflicting-copies" as const])];
      return;
    }
    if (!twin.grade && course.grade) {
      Object.assign(twin, { ...course, review: course.review });
      if (!course.review) delete twin.review;
    }
    if (twin.points == null && course.points != null) twin.points = course.points;
    if (!twin.option && course.option) twin.option = course.option;
  };

  const startRow = (at: { parts: CodeParts; src: string }) => {
    finish();
    row = {
      parts: at.parts, src: at.src, title: [], units: null, option: null, cnv: false,
      grade: null, points: null, stage: "title",
    };
  };

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const t = cell.text;
    const lower = t.toLowerCase();

    // ── structure: headings, dates, sections, headers ──
    if (!cell.blank) {
      // A heading, whole or split across two cells ("2026/2027" + "Fall Quarter").
      let heading = termFromTssHeading(t);
      let label = t;
      if (!heading && YEAR_PAIR.test(t) && cells[i + 1] && !cells[i + 1].blank) {
        heading = termFromTssHeading(`${t} ${cells[i + 1].text}`);
        if (heading) {
          label = `${t} ${cells[i + 1].text}`;
          i++;
        }
      }
      if (heading) {
        finish();
        // Transfer credit is never a UCSD attempt, whatever heading it is filed under.
        if (context.kind === "external") continue;
        if (!terms.has(heading)) terms.set(heading, { code: heading, label: label.replace(/\s*\(\d+\)$/, ""), courses: [] });
        context = { kind: "term", code: heading };
        continue;
      }
      const range = dateRange(t);
      if (range) {
        finish();
        if (context.kind === "term") {
          const term = terms.get(context.code)!;
          if (!term.start) {
            term.start = range.start;
            term.end = range.end;
            if (!datesFitTerm(term.code, range)) {
              messages.push({
                level: "warn", code: "DATES_CONFLICT",
                text: `"${term.label}" printed dates (${t}) that don't match that quarter. Its courses stay under the heading; check them.`,
              });
            }
          }
        }
        continue;
      }
      const section = SECTIONS.find(([re]) => re.test(t))?.[1];
      if (section) {
        finish();
        context = section === "history" ? { kind: "none" } : { kind: section };
        continue;
      }
      if (HEADER.has(lower)) {
        // A repeated header between rows ends the row before it.
        if (row && (row as Draft).stage !== "title") finish();
        continue;
      }
      const loaded = LOADED.exec(t);
      if (loaded && !row) {
        if (Number(loaded[1]) < Number(loaded[2])) partial = true;
        continue;
      }
      if (NOISE.has(lower) || PROSE.test(t)) continue;
    }

    // ── a code starts a row (and ends any row before it) ──
    // "NP" or "IP" where a grade is due is the grade, even with a number after it.
    const current = row as Draft | null;
    const gradeDue = current != null && (current.stage === "units" || current.stage === "option")
      && !cell.blank && isGradeToken(t);
    const code = codeAt(cells, i);
    if (code && !(gradeDue && code.used === 2)) {
      startRow(code);
      i += code.used - 1;
      continue;
    }

    if (!current) continue;
    const d: Draft = current;

    switch (d.stage) {
      case "title": {
        if (cell.blank) break;
        if (DECIMAL.test(t) || (UNITS.test(t) && d.title.length > 0)) {
          d.units = num(t);
          d.stage = "units";
        } else if (d.title.length >= MAX_TITLE_CELLS) {
          finish();
        } else {
          d.title.push(t);
        }
        break;
      }
      case "units": {
        const opt = OPTION.exec(t);
        if (cell.blank) {
          d.stage = "option";
        } else if (opt) {
          d.option = opt[2].replace(/\s*\/\s*/g, "/").replace(/\b\w/g, (ch) => ch.toUpperCase()).replace(/^P\/Np$/, "P/NP").replace(/^S\/U$/, "S/U");
          d.cnv = Boolean(opt[1]);
          d.stage = "option";
        } else if (isGradeToken(t)) {
          d.grade = t;
          d.stage = "grade";
        } else if (DECIMAL.test(t)) {
          d.points = num(t);
          finish();
        } else if (t.length <= 40) {
          // A grading option this does not know; kept as printed.
          const cnv = /^cnv\s*[-–]\s*/i.test(t);
          d.option = t.replace(/^cnv\s*[-–]\s*/i, "");
          d.cnv = cnv;
          d.stage = "option";
        } else {
          finish();
        }
        break;
      }
      case "option": {
        if (cell.blank) {
          d.stage = "grade";
        } else if (isGradeToken(t)) {
          d.grade = t;
          d.stage = "grade";
        } else if (DECIMAL.test(t)) {
          d.points = num(t);
          finish();
        } else {
          finish();
        }
        break;
      }
      case "grade": {
        if (!cell.blank && DECIMAL.test(t)) d.points = num(t);
        finish();
        break;
      }
    }
  }
  finish();

  const out = [...terms.values()].filter((term) => term.courses.length);

  if (partial) {
    messages.push({
      level: "warn", code: "PARTIAL_LIST",
      text: "TSS had loaded only part of a list when it was copied. Press More in TSS until every quarter shows, then paste again; this adds to what is here.",
    });
  }
  if (unplaced.length) {
    messages.push({
      level: "warn", code: "NO_QUARTER",
      text: `${unplaced.length} ${unplaced.length === 1 ? "course was" : "courses were"} printed under no quarter heading, so ${unplaced.length === 1 ? "it isn't" : "they aren't"} placed yet. Pick the quarter below, or copy Academic History By Quarter in TSS.`,
    });
  }
  if (externalRows) {
    messages.push({
      level: "info", code: "EXTERNAL_NOT_READ",
      text: "Transfer and test credit (External Work in TSS) isn't read from a paste yet. Add it under Transfer and test credit below if you want it shown.",
    });
  }
  if (duplicates) {
    messages.push({
      level: "info", code: "DUPLICATES",
      text: `${duplicates} ${duplicates === 1 ? "course appeared" : "courses appeared"} twice in the same quarter (for example in Current Bookings too) and ${duplicates === 1 ? "was" : "were"} kept once.`,
    });
  }
  const all = [...out.flatMap((term) => term.courses), ...unplaced];
  const count = (r: ReviewReason) => all.filter((c) => c.review?.includes(r)).length;
  if (count("conflicting-copies")) {
    messages.push({ level: "warn", code: "CONFLICT", text: `${count("conflicting-copies")} ${count("conflicting-copies") === 1 ? "course was" : "courses were"} copied twice in one quarter with different grades. Check ${count("conflicting-copies") === 1 ? "it" : "them"} in TSS.` });
  }
  if (count("unknown-grade")) {
    messages.push({ level: "warn", code: "UNKNOWN_GRADE", text: `${count("unknown-grade")} ${count("unknown-grade") === 1 ? "grade wasn't" : "grades weren't"} recognised. ${count("unknown-grade") === 1 ? "It isn't" : "They aren't"} counted as passed.` });
  }
  if (count("points-mismatch")) {
    messages.push({ level: "warn", code: "POINTS_MISMATCH", text: `${count("points-mismatch")} ${count("points-mismatch") === 1 ? "row's" : "rows'"} grade points don't match the grade and units. Check the units before saving.` });
  }
  if (count("no-units")) {
    messages.push({ level: "warn", code: "NO_UNITS", text: `${count("no-units")} ${count("no-units") === 1 ? "row has" : "rows have"} no units. Add them below.` });
  }
  return { terms: out, unplaced, messages, duplicates, externalRows };
}

/** Whether a paste came from TSS: a quarter heading in its academic-year form, or its table's own column. */
export function looksLikeTss(raw: string): boolean {
  const text = String(raw ?? "").slice(0, MAX_INPUT_CHARS);
  return /^\s*\d{4}\s*[/–-]\s*\d{4}\s+(?:fall|winter|spring|summer|special)\b/im.test(text)
    || /\bgrading option\b/i.test(text)
    || /\bmy academic history\b/i.test(text)
    || /^\s*[A-Z]{2,5}-\d{1,3}[A-Z]{0,3}\b/m.test(text);
}

/** Whether a paste reads like a degree audit (uAchieve) rather than an Academic History. */
export function looksLikeAudit(raw: string): boolean {
  const text = String(raw ?? "").slice(0, MAX_INPUT_CHARS);
  return /\bNEEDS:|\bSELECT FROM:|\b(?:requirement|requirements) (?:complete|not complete)\b|\bdegree audit report\b|\bAT LEAST \d+ (?:UNITS|COURSES)\b/i.test(text);
}

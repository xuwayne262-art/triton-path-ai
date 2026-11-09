/**
 * Reads a UC San Diego Academic History that a student has pasted in.
 *
 * WHY PASTE, AND WHY HERE
 * The record a student needs is already on screen on TritonLink. Asking them to
 * download it as a PDF, find the file, and drag it back is three steps that
 * exist only to get the text off that page — and every one of them can fail on
 * a phone. Select-all and paste skips all three, and the text that arrives is
 * the page's own, not a PDF extractor's guess at it.
 *
 * Nothing here touches the network. A student's transcript is the most
 * sensitive thing this site will ever hold, so the parse runs in their browser
 * and only the structured result is ever sent anywhere — never the raw paste,
 * which carries their name and PID.
 *
 * WHAT IT REFUSES TO DO
 * It never invents a row. A line that looks like coursework but will not parse
 * is reported as a warning, with the line, so the student can see what was
 * skipped and fix it by hand. Silently dropping a course understates their
 * progress, and silently guessing at one overstates it; both are worse than
 * saying "this line, I could not read".
 */

// ── Wire types ───────────────────────────────────────────────────────────────
// Defined in types.ts and re-exported here, where they have always been imported from.

import { type HistoryCourse, type HistoryTerm, type ParsedHistory, type TransferCourse } from "./types";
import { gradeStatus } from "./grades";
import { termOrder } from "./terms";
import { computeTotals, withStatuses } from "./attempts";
import { resolveCode } from "./codes";
import { NO_QUARTER, TSS_PARSER, looksLikeAudit, looksLikeTss, readTss, type ReadMessage } from "./tss";
import { QUARTERS, todayInSanDiego } from "@/lib/housing/terms";

export type {
  GradeStatus, HistoryCourse, HistoryTerm, HistorySource, ParsedHistory, ReviewReason, TransferCourse,
} from "./types";
export { earnsUnits, gradeStatus, isGraded } from "./grades";
export { termOrder } from "./terms";
export { computeTotals } from "./attempts";

// ── Term codes ───────────────────────────────────────────────────────────────

const SEASON: Record<string, string> = {
  fall: "FA", winter: "WI", spring: "SP",
};

/**
 * "Fall Quarter 2025" -> "FA25". Summer sessions keep their session number,
 * because Summer I and Summer II are different terms with different deadlines
 * and collapsing them to one "SU" loses a distinction the planner needs.
 */
export function termCode(label: string): string | null {
  const text = String(label || "").trim();

  const summer = /\bsum(?:mer)?\s*(?:ses(?:sion)?)?\s*(I{1,3}|[123])?\b[^0-9]*(\d{4})/i.exec(text);
  if (summer) {
    const roman: Record<string, string> = { I: "1", II: "2", III: "3", "1": "1", "2": "2", "3": "3" };
    const n = roman[(summer[1] || "I").toUpperCase()] ?? "1";
    return `S${n}${summer[2].slice(2)}`;
  }

  const main = /\b(fall|winter|spring)\b[^0-9]*(\d{4})/i.exec(text);
  if (main) return SEASON[main[1].toLowerCase()] + main[2].slice(2);

  return null;
}

// ── Line shapes ──────────────────────────────────────────────────────────────

/**
 * A term header. TritonLink prints "Term: Fall Quarter 2025", but a select-all
 * copy sometimes loses the label and leaves the bare term name on its own line,
 * so both are accepted.
 */
const TERM_LINE = /^(?:term\s*:\s*)?((?:fall|winter|spring|sum(?:mer)?)[^,\n]*?\b(?:qtr|quarter|ses(?:sion)?\s*I{0,3})?\s*\d{4})\s*$/i;

/**
 * One coursework row:  SUBJ NUM  Title  Units  [Grade]  [Points]
 *
 * Units and points may carry one OR two decimals — a 7.5-unit course prints as
 * "7.5" on some records, and demanding two digits drops the whole row. Points
 * are optional because an in-progress term prints none.
 */
const COURSE_LINE =
  /^([A-Z]{2,4})\s+([0-9]{1,3}[A-Z]{0,3})\s+(.+?)\s+(\d+(?:\.\d{1,2})?)(?:\s+(A[+-]?|B[+-]?|C[+-]?|D[+-]?|F|P|NP|IP|I|W|S|U))?(?:\s+(\d+(?:\.\d{1,2})?))?\s*$/;

/**
 * A row that opens with a subject code and has numbers on the end but does not
 * match COURSE_LINE — almost certainly coursework the parser should have read.
 * Used only to decide what deserves a warning, so a footer never triggers one.
 */
const LOOKS_LIKE_COURSE = /^[A-Z]{2,4}\s+[0-9]{1,3}[A-Z]{0,3}\s+\S.*\d/;

/**
 * The transfer-credit spine: "<source> <units> [grade] <term> <LD|UD> [equiv]".
 *
 * A transfer row is recognised on this run, never on the subject token. Keying
 * it to a literal "AP" or "IB" cannot work: a community-college row starts with
 * the college's name, so it would not begin a row at all and its units would be
 * swallowed into whichever AP row came before it.
 */
const TRANSFER_SPINE =
  /^(.*?)\s*\b(\d{1,3}(?:\.\d{1,2})?)(?:\s+([A-Z]{1,2}[+-]?))?\s+((?:FA|WI|SP|SU|SS|S[123])\d{2})\s+(LD|UD)\b\s*(.*)$/;

/** "SUBJ NUM Title" — exam rows use codes like CA4 and DIPL, not just "1A". */
const TRANSFER_HEAD = /^([A-Z]{2,6})\s+([A-Z0-9]{1,6})\s+(\S.*)$/;

/** A continuation line is ONLY course codes — that is what keeps prose out. */
const TRANSFER_CONT = /^[A-Z]{2,4}\s+\d{1,3}[A-Z]{0,3}(?:[\s,]+[A-Z]{2,4}\s+\d{1,3}[A-Z]{0,3})*$/;

/**
 * Roman numerals are the one token shape indistinguishable from a subject code,
 * which is how "Calculus II 6.00" once yielded a course called "II 6". No UCSD
 * subject is a bare Roman numeral, so excluding them costs nothing.
 */
const ROMAN = /^(?:I{1,3}|IV|V|VI{1,3}|IX|X)$/;

/**
 * The colon is required, not decoration. Without it "College Board 8.00 P SP24
 * LD MATH 20A" — the source line of an AP transfer row — reads as a college
 * declaration, which both mislabels the student's college and eats the transfer
 * credit, because the row never reaches the spine test below.
 */
const PROGRAM_LINE = /^(majors?|minors?|college)\s*:\s*(.+)$/i;

/**
 * A title that contains another "SUBJ NUM ... units" run means two printed rows
 * were joined into one line, which a PDF extractor does when a column overflows.
 * The row would otherwise parse as a single course with a nonsense title and the
 * second course would vanish, so it is reported rather than accepted.
 */
const MERGED_ROWS = /\d+\.\d{2}\s+(?:[A-DF][+-]?|P|NP|IP|W|S|U)?\s*\d*\.?\d*\s*[A-Z]{2,4}\s+\d{1,3}[A-Z]{0,3}\s/;

/** Lines that are page furniture, never data. */
const NOISE =
  /^(?:academic history|unofficial|official|this is not|page \d|printed|name\s*:|pid\s*:|student id|gpa|units?\b.*:|total|cumulative|term (?:gpa|units)|transfer credit|degree|level\b|\s*$)/i;

// ── Parse ────────────────────────────────────────────────────────────────────

/** Splits "Computer Science; Mathematics" or "A and B" into separate programs. */
function splitPrograms(value: string): string[] {
  return String(value || "")
    .split(/\s*(?:;|,| and |\/|\|)\s*/i)
    .map((s) => s.replace(/\s*\((?:major|minor|pending|declared)\)\s*$/i, "").trim())
    .filter((s) => s.length > 1 && !/^n\/?a$/i.test(s));
}

const num = (s: string | undefined) => {
  const n = parseFloat(String(s ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/** The TritonLink (pre-Fall 2026) Academic History reader, unchanged in what it accepts. */
export function parseLegacyHistory(raw: string): ParsedHistory {
  const lines = String(raw || "")
    .replace(/\r\n?/g, "\n")
    // A PDF extractor pads columns with runs of spaces and non-breaking spaces;
    // collapsing them first lets one set of patterns read both sources.
    .replace(/ /g, " ")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim());

  const out: ParsedHistory = {
    college: null, majors: [], minors: [], terms: [], transfer: [], warnings: [],
    totals: { courses: 0, unitsEarned: 0, unitsInProgress: 0, transferUnits: 0, gpa: null },
  };

  const byTerm = new Map<string, HistoryTerm>();
  let current: HistoryTerm | null = null;
  /** The transfer row being assembled, if the last head line started one. */
  let pendingHead: { code: string; title: string } | null = null;
  let lastTransfer: TransferCourse | null = null;

  for (const line of lines) {
    if (!line) continue;

    // ── programs ──
    const program = PROGRAM_LINE.exec(line);
    if (program) {
      const kind = program[1].toLowerCase();
      const values = splitPrograms(program[2]);
      if (kind.startsWith("college")) out.college = values[0] ?? out.college;
      else if (kind.startsWith("major")) out.majors.push(...values);
      else out.minors.push(...values);
      continue;
    }

    // ── term header ──
    const term = TERM_LINE.exec(line);
    if (term) {
      const code = termCode(term[1]);
      if (code) {
        current = byTerm.get(code) ?? { code, label: term[1].trim(), courses: [] };
        byTerm.set(code, current);
        pendingHead = null;
        lastTransfer = null;
        continue;
      }
    }

    // ── transfer credit ──
    // Tried before COURSE_LINE: a spine carries a term code where a course row
    // carries a grade, and only the spine ends in LD/UD.
    const spine = TRANSFER_SPINE.exec(line);
    if (spine) {
      const [, from, units, , , level, tail] = spine;
      const equivalents = tail.trim() ? [tail.trim()] : [];
      const row: TransferCourse = {
        code: pendingHead ? pendingHead.code : null,
        title: pendingHead ? pendingHead.title : from.trim(),
        units: num(units),
        from: from.trim() || (pendingHead ? "Transfer" : "Transfer"),
        level: level || null,
        equivalents,
      };
      out.transfer.push(row);
      lastTransfer = row;
      pendingHead = null;
      continue;
    }

    // Further UCSD equivalents for the row just recorded.
    if (lastTransfer && TRANSFER_CONT.test(line)) {
      lastTransfer.equivalents.push(line.trim());
      continue;
    }

    // ── coursework ──
    const course = COURSE_LINE.exec(line);
    if (course && !ROMAN.test(course[1]) && MERGED_ROWS.test(course[3])) {
      out.warnings.push(line);
      continue;
    }
    if (course && !ROMAN.test(course[1])) {
      const [, subject, number, title, units, grade, points] = course;
      const status = gradeStatus(grade ?? null);
      const record: HistoryCourse = {
        code: `${subject} ${number}`,
        subject,
        number,
        title: title.trim(),
        units: num(units),
        grade: grade ?? null,
        points: points != null ? num(points) : null,
        status,
      };
      // Coursework printed before any term header belongs to no term we can
      // name; parking it under "XFER" keeps it visible rather than lost.
      if (!current) {
        current = byTerm.get("XFER") ?? { code: "XFER", label: "Credit with no term", courses: [] };
        byTerm.set("XFER", current);
      }
      current.courses.push(record);
      lastTransfer = null;
      pendingHead = null;
      continue;
    }

    // ── a head line for the transfer row on the next line ──
    const head = TRANSFER_HEAD.exec(line);
    if (head && !ROMAN.test(head[1]) && !NOISE.test(line)) {
      pendingHead = { code: `${head[1]} ${head[2]}`, title: head[3].trim() };
      continue;
    }

    // ── anything left that looked like data ──
    if (!NOISE.test(line) && LOOKS_LIKE_COURSE.test(line)) {
      out.warnings.push(line);
    }
  }

  out.terms = [...byTerm.values()]
    .filter((t) => t.courses.length)
    .sort((a, b) => termOrder(a.code) - termOrder(b.code));

  // ── totals, computed rather than read ──
  // The page prints its own GPA, but a student who pastes a partial page would
  // carry a total that does not match the rows beneath it. Deriving it from the
  // rows we actually parsed keeps the number and the list telling one story.
  out.totals = computeTotals(out);

  out.majors = dedupe(out.majors);
  out.minors = dedupe(out.minors);

  return out;
}

const dedupe = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

/**
 * True when a paste produced nothing worth saving — so the UI can say "that
 * does not look like an Academic History" instead of writing an empty record
 * over one the student already had.
 */
export const isEmpty = (h: ParsedHistory): boolean =>
  h.terms.length === 0 && h.transfer.length === 0;

// ── Reading any Academic History ─────────────────────────────────────────────

export const LEGACY_PARSER = "legacy-1";

export interface ReadOptions {
  /** Today in San Diego, YYYY-MM-DD; decides whether a blank grade is in progress or missing. */
  today?: string;
  /** Whether the catalog has a course code, to match "WCWP-010B" to "WCWP 10B". Null skips matching. */
  has?: ((code: string) => boolean) | null;
}

export interface ReadReport {
  source: "tss" | "legacy" | "unknown";
  parser: string;
  /** What the student should know, worst first. Never the paste's own text. */
  messages: ReadMessage[];
  terms: number;
  rows: number;
  review: number;
  duplicates: number;
  /**
   * The quarter under way, offered (never applied) for rows the paste printed
   * under no quarter, such as Current Bookings copied without its heading.
   */
  suggestedTerm: string | null;
}

export interface ReadResult {
  history: ParsedHistory;
  /** Rows with no quarter, for the student to place. Not part of `history` until they are. */
  unplaced: HistoryCourse[];
  report: ReadReport;
}

/** TSS's own steps, said the same way everywhere the importer explains them. */
export const TSS_STEPS =
  "In TSS, open My Academic History, then Academic History, Undergraduate and By Quarter. Open each quarter so its courses show, then copy again.";

const LEVEL_ORDER: Record<ReadMessage["level"], number> = { error: 0, warn: 1, info: 2 };

/** The quarter running on `today`, or the next to start. */
function quarterOn(today: string): string | null {
  const q = QUARTERS.find((x) => x.begins <= today && today <= x.end) ?? QUARTERS.find((x) => x.begins > today);
  return q && /^(FA|WI|SP)\d\d$/.test(q.key) ? q.key : null;
}

/** Codes matched against the catalog: "WCWP-010B" becomes "WCWP 10B" only when the catalog has it. */
function resolveAll(courses: HistoryCourse[], has: ReadOptions["has"]): HistoryCourse[] {
  if (!has) return courses;
  return courses.map((c) => {
    const r = resolveCode({ subject: c.subject, number: c.number }, has);
    const out: HistoryCourse = { ...c, code: r.code, number: r.number };
    if (r.matched) delete out.unmatched;
    else out.unmatched = true;
    return out;
  });
}

/**
 * A saved record's codes matched to the catalog, for records saved before
 * matching existed or while the catalog could not load. Rows already matched
 * are left alone; a code is only ever changed to one the catalog has.
 */
export function resolveHistoryCodes<T extends Pick<ParsedHistory, "terms">>(history: T, has: (code: string) => boolean): T {
  return {
    ...history,
    terms: history.terms.map((t) => ({
      ...t,
      courses: t.courses.map((c) => {
        if (has(c.code)) return c.unmatched ? { ...c, unmatched: undefined } : c;
        const r = resolveCode({ subject: c.subject, number: c.number }, has);
        return r.matched ? { ...c, code: r.code, number: r.number, src: c.src ?? c.code, unmatched: undefined } : c;
      }),
    })),
  };
}

/**
 * Reads a pasted Academic History, from TSS or from the old TritonLink page,
 * and says what it found. Nothing here touches the network.
 */
export function readAcademicHistory(raw: string, opts: ReadOptions = {}): ReadResult {
  const today = opts.today ?? todayInSanDiego();
  const text = String(raw ?? "");
  const empty: ParsedHistory = {
    college: null, majors: [], minors: [], terms: [], transfer: [], warnings: [],
    totals: { courses: 0, unitsEarned: 0, unitsInProgress: 0, transferUnits: 0, gpa: null },
  };

  if (looksLikeTss(text)) {
    const r = readTss(text);
    const terms = r.terms
      .map((t) => ({ ...t, courses: resolveAll(t.courses, opts.has) }))
      .sort((a, b) => termOrder(a.code) - termOrder(b.code));
    const unplaced = resolveAll(r.unplaced, opts.has);
    const history = withStatuses({ ...empty, terms, source: "tss" as const }, today);
    // No GPA: TSS does not show one yet, and a partial paste would make one up.
    history.totals = { ...computeTotals(history, today), gpa: null };
    const messages = [...r.messages];
    const rows = terms.reduce((n, t) => n + t.courses.length, 0) + unplaced.length;
    if (!rows) {
      messages.unshift({
        level: "error", code: "NO_ROWS_TSS",
        text: `This looks like TSS, but no course rows came through. ${TSS_STEPS}`,
      });
    }
    messages.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
    return {
      history,
      unplaced,
      report: {
        source: "tss", parser: TSS_PARSER, messages,
        terms: terms.length, rows,
        review: [...terms.flatMap((t) => t.courses), ...unplaced].filter((c) => c.review?.length).length,
        duplicates: r.duplicates,
        suggestedTerm: unplaced.length ? quarterOn(today) : null,
      },
    };
  }

  const legacy = parseLegacyHistory(text);
  const terms = legacy.terms.map((t) => ({ ...t, courses: resolveAll(t.courses, opts.has) }));
  const history = withStatuses({ ...legacy, terms, source: "legacy" as const }, today);
  history.totals = computeTotals(history, today);
  const messages: ReadMessage[] = [];
  const rows = terms.reduce((n, t) => n + t.courses.length, 0);
  if (isEmpty(history)) {
    messages.push(looksLikeAudit(text)
      ? {
          level: "error", code: "AUDIT_TEXT",
          text: `This looks like a degree audit. UCSDPlans reads your Academic History, not a degree audit. ${TSS_STEPS}`,
        }
      : {
          level: "error", code: "NOT_HISTORY",
          text: `No courses came through, so nothing was changed. ${TSS_STEPS}`,
        });
  }
  if (legacy.warnings.length) {
    messages.push({
      level: "warn", code: "LEGACY_LINES",
      text: `${legacy.warnings.length} ${legacy.warnings.length === 1 ? "line" : "lines"} could not be read. They are listed below and are not saved.`,
    });
  }
  return {
    history,
    unplaced: [],
    report: {
      source: isEmpty(history) ? "unknown" : "legacy",
      parser: LEGACY_PARSER, messages,
      terms: terms.length, rows, review: 0, duplicates: 0, suggestedTerm: null,
    },
  };
}

/** The structured record from any paste; rows printed under no quarter are left out. */
export function parseAcademicHistory(raw: string, opts: ReadOptions = {}): ParsedHistory {
  return readAcademicHistory(raw, opts).history;
}

export { NO_QUARTER };

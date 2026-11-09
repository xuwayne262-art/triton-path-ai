/**
 * The shape of an imported Academic History, shared by the parsers, the
 * review screen, the server and the planner.
 *
 * Version 2 (TSS, Nov 2026) adds optional fields only, so every record saved
 * before it reads as it always did.
 */

/**
 * What a grade says about a course.
 *
 * "progress" is a course still under way: a blank grade in a term that has
 * not ended, or UCSD's IP. "missing" is a blank grade, or NR, in a term that
 * has ended: the grade is not there, and it is never read as a pass. A blank
 * grade is judged against the term's dates whenever it is shown (see
 * attempts.ts), so a course saved as in progress does not stay in progress
 * once its term is over.
 */
export type GradeStatus =
  | "graded"
  | "pass"
  | "fail"
  | "withdrawn"
  | "incomplete"
  | "progress"
  | "missing"
  | "other";

/**
 * Why a row needs the student to look at it. A row with any of these is
 * shown and saved, and counts toward nothing until it is fixed.
 */
export type ReviewReason =
  /** A grade symbol UCSDPlans does not know. Never read as a pass. */
  | "unknown-grade"
  /** The printed grade points do not match the grade and units, so a column may have shifted. */
  | "points-mismatch"
  /** The paste did not say which quarter the course was in. */
  | "no-quarter"
  /** No units were printed for the row. */
  | "no-units"
  /** The same course appeared twice in one quarter with different grades. */
  | "conflicting-copies";

export const REVIEW_REASONS: readonly ReviewReason[] = [
  "unknown-grade", "points-mismatch", "no-quarter", "no-units", "conflicting-copies",
];

export interface HistoryCourse {
  /** "CSE 11": the catalog's code when the source's matched one, else as printed. */
  code: string;
  subject: string;
  number: string;
  title: string;
  units: number;
  /** As printed: "A-", "P", "IP", "W". null when none is shown. */
  grade: string | null;
  /** Grade points UCSD printed for the row, when it printed any. Never units. */
  points: number | null;
  /** As read at import. Readers judge blank grades again by date (attempts.ts). */
  status: GradeStatus;
  /** The code exactly as the source printed it, when it differs: "WCWP-010B". */
  src?: string;
  /** The grading option as printed, without TSS's "CNV - " prefix: "Letter Grade". */
  option?: string;
  /** TSS converted the row from the former student system ("CNV - Letter Grade"). */
  cnv?: boolean;
  /** Reasons the row needs a look. A row with any is shown, saved and never counted as done. */
  review?: ReviewReason[];
  /**
   * The current catalog has no course by this code (a retired or renumbered
   * course). Kept as printed and still counted for the units it earned.
   */
  unmatched?: boolean;
  /** Added or corrected by the student on the review screen. */
  manual?: boolean;
}

export interface HistoryTerm {
  /** "FA25"; "XFER" on records from before terms were required. */
  code: string;
  /** "Fall Quarter 2025" or "2026/2027 Fall Quarter", as printed. */
  label: string;
  courses: HistoryCourse[];
  /** The quarter's dates as the source printed them, YYYY-MM-DD. */
  start?: string;
  end?: string;
}

export interface TransferCourse {
  /** The UCSD course this was granted as, when one is named. */
  code: string | null;
  title: string;
  units: number;
  /** "Grossmont College", "AP", "IB". */
  from: string;
  /** "LD" / "UD", when printed. */
  level: string | null;
  /** UCSD equivalents beyond the first, for rows that list several. */
  equivalents: string[];
  /** Entered by the student rather than read from a record. */
  manual?: boolean;
}

export type HistorySource = "tss" | "legacy" | "manual";

export interface ParsedHistory {
  college: string | null;
  majors: string[];
  minors: string[];
  terms: HistoryTerm[];
  transfer: TransferCourse[];
  /**
   * Lines that looked like data and did not parse. Shown on the review
   * screen; never sent to the server, because they are the paste's own text.
   */
  warnings: string[];
  /** Totals computed from the rows, not read off the page. */
  totals: {
    courses: number;
    unitsEarned: number;
    unitsInProgress: number;
    transferUnits: number;
    gpa: number | null;
  };
  /** Where the rows were read from. */
  source?: HistorySource;
  /**
   * Where this record sits in the 4-year plan: the calendar year whose fall
   * starts Year 1. Set only when the student says so.
   */
  planStart?: number;
}

/** A course attempt's identity: the same course in the same term is the same attempt. */
export const attemptKey = (term: string, code: string) => `${term}|${code}`;
